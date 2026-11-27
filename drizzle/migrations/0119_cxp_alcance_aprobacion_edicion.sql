-- CT-077 a CT-079: autorizar la aprobación y edición de CxP en la organización activa.

CREATE OR REPLACE FUNCTION public.aprobar_factura_proveedor(p_id uuid, p_aprobar boolean, p_motivo text DEFAULT NULL::text, p_expected_updated_at timestamptz DEFAULT NULL::timestamptz) RETURNS public.proveedor_facturas
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row public.proveedor_facturas;
  v_uid uuid := auth.uid();
  v_org uuid;
  v_email text;
  v_desvinculo jsonb := '{}'::jsonb;
  v_estado_actual text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;
  v_org := public.org_scope();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Factura no encontrada' USING ERRCODE = '42501';
  END IF;
  -- Los roles locales autorizados también pueden aprobar sus propias capturas.
  IF NOT public.has_any_role_in_org_exact(v_uid,
         ARRAY['admin','admin_org','super_admin','contador']::public.app_role[], v_org) THEN
    RAISE EXCEPTION 'LC_SOD_VIOLATION: Tu rol no puede aprobar ni rechazar facturas de proveedor.';
  END IF;
  -- A-3: FOR UPDATE serializa dos clics simultáneos sobre la misma factura.
  SELECT * INTO v_row FROM public.proveedor_facturas
   WHERE id = p_id AND organization_id = v_org AND deleted_at IS NULL
   FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Factura no encontrada' USING ERRCODE = '42501';
  END IF;
  IF p_expected_updated_at IS NULL OR v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'LC_CONFLICTO_CONCURRENCIA: la factura cambió desde que la revisaste. Recarga y revisa los datos actuales antes de decidir.'
      USING ERRCODE = 'PT409';
  END IF;
  IF v_row.estado_aprobacion <> 'pendiente' THEN
    RAISE EXCEPTION 'La factura ya fue %', v_row.estado_aprobacion;
  END IF;
  -- Ola 4 (H2): al aprobar, `p_motivo` es la justificación del gasto sin respaldo.
  IF p_aprobar THEN
    PERFORM public._cxp_validar_aprobacion(p_id, p_motivo);
  END IF;
  -- A-3: relectura redundante dentro del bloqueo (defensa ante validaciones
  -- que pudieran liberar el lock por subtransacciones).
  SELECT estado_aprobacion::text INTO v_estado_actual
    FROM public.proveedor_facturas WHERE id = p_id FOR UPDATE;
  IF v_estado_actual <> 'pendiente' THEN
    RAISE EXCEPTION 'La factura ya fue %', v_estado_actual;
  END IF;
  -- RNF-07: marca de sesión requerida por trg_guard_aprobacion_proveedor_factura
  PERFORM set_config('app.aprobando_cxp', '1', true);
  IF p_aprobar THEN
    UPDATE public.proveedor_facturas
    SET estado_aprobacion = 'aprobada',
        aprobada_por = v_uid,
        aprobada_at = now(),
        motivo_rechazo = NULL,
        aprobacion_heredada = false,
        justificacion_sin_vinculo = NULLIF(btrim(COALESCE(p_motivo,'')), '')
    WHERE id = p_id AND estado_aprobacion = 'pendiente' RETURNING * INTO v_row;
  ELSE
    IF COALESCE(trim(p_motivo),'') = '' THEN
      RAISE EXCEPTION 'Motivo de rechazo requerido';
    END IF;
    UPDATE public.proveedor_facturas
    SET estado_aprobacion = 'rechazada', aprobada_por = v_uid, aprobada_at = now(), motivo_rechazo = p_motivo
    WHERE id = p_id AND estado_aprobacion = 'pendiente' RETURNING * INTO v_row;
  END IF;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'La factura ya fue procesada por otra sesión. Recarga la pantalla.'
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF NOT p_aprobar THEN
    -- v13.493.0 — el rechazo rompe el vínculo con el embarque.
    v_desvinculo := public._cxp_desvincular_por_rechazo(p_id, p_motivo);
    SELECT * INTO v_row FROM public.proveedor_facturas WHERE id = p_id;
  END IF;
  PERFORM set_config('app.aprobando_cxp', '0', true);
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    INSERT INTO public.bitacora_actividad
      (organization_id, usuario_id, usuario_email, accion, modulo, entidad_id, entidad_nombre, detalles, fuente_evento)
    VALUES (
      v_row.organization_id,
      v_uid,
      COALESCE(v_email, ''),
      CASE WHEN p_aprobar THEN 'aprobar_factura_proveedor' ELSE 'rechazar_factura_proveedor' END,
      'cxp',
      v_row.id,
      'Factura ' || COALESCE(v_row.folio_proveedor,'') || ' de ' || COALESCE(v_row.proveedor_nombre,''),
      jsonb_build_object(
        'motivo', p_motivo,
        'total', v_row.total,
        'moneda', v_row.moneda,
        'tipo_cambio_usd', v_row.tipo_cambio_usd,
        'aprobada', p_aprobar,
        'justificacion_sin_vinculo', v_row.justificacion_sin_vinculo
      ) || v_desvinculo,
      'rpc_aprobar_factura_proveedor'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'bitacora_actividad insert failed in aprobar_factura_proveedor: % %', SQLSTATE, SQLERRM;
  END;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.aprobar_factura_proveedor(uuid, boolean, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprobar_factura_proveedor(uuid, boolean, text, timestamptz) TO authenticated, service_role;
--> statement-breakpoint
-- Fuente canónica de public.actualizar_pago_proveedor_atomico(...).
-- D5 (v13.823.382): edición de pago CxP transaccional. Bloquea pago y factura,
-- valida rol/tenant/concurrencia, actualiza el pago y reemplaza SÓLO el
-- movimiento bancario derivado del sistema en la misma transacción; las líneas
-- importadas del estado de cuenta se desvinculan, nunca se borran.
-- Al modificar: edita ESTE archivo y genera la migración con el mismo cuerpo.

CREATE OR REPLACE FUNCTION public.actualizar_pago_proveedor_atomico(
  p_pago_id uuid,
  p_fecha_pago date,
  p_monto numeric,
  p_moneda text,
  p_tipo_cambio_usd numeric,
  p_metodo_pago text,
  p_referencia text DEFAULT ''::text,
  p_cuenta_bancaria_id uuid DEFAULT NULL,
  p_notas text DEFAULT ''::text,
  p_diferencia_cambiaria_mxn numeric DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pago public.pagos_proveedor;
  v_org uuid;
  v_mov_id uuid;
BEGIN
  v_org := public.org_scope();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'LC_SIN_ORG: no hay organización activa para validar el pago'
      USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_any_role_in_org_exact(auth.uid(),
        ARRAY['tesorero','contador','admin','admin_org','super_admin']::public.app_role[], v_org) THEN
    RAISE EXCEPTION 'LC_PAGO_SIN_PERMISO: se requiere permiso de tesorería para editar el pago'
      USING ERRCODE = '42501';
  END IF;

  -- D5: todo en UNA transacción (pago + movimiento espejo). Antes eran tres
  -- llamadas del navegador y un fallo dejaba la factura editada sin salida
  -- bancaria (o con la salida vieja).
  SELECT * INTO v_pago FROM public.pagos_proveedor
   WHERE id = p_pago_id AND organization_id = v_org AND deleted_at IS NULL
   FOR UPDATE;
  IF v_pago.id IS NULL THEN
    RAISE EXCEPTION 'LC_PAGO_NO_ENCONTRADO: el pago ya no existe o fue eliminado'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_pago.lote_id IS NOT NULL THEN
    RAISE EXCEPTION 'LC_PAGO_LOTE_NO_EDITABLE: edita el lote completo para conservar sus aplicaciones'
      USING ERRCODE = '23514';
  END IF;
  IF lower(btrim(p_metodo_pago)) IN ('efectivo','01') THEN
    p_cuenta_bancaria_id := NULL;
  END IF;

  -- Auditoría 23: una aplicación pertenece al flujo de anticipos. Rechazar
  -- ANTES de modificar pago, cuenta o movimientos, incluso con flag legacy.
  IF v_pago.es_anticipo_aplicado
     OR EXISTS (SELECT 1 FROM public.anticipos_aplicaciones aa
                WHERE aa.pago_proveedor_id = p_pago_id AND aa.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'LC_PAGO_ANTICIPO_NO_EDITABLE: el pago proviene de un anticipo; usa Revertir aplicación y vuelve a aplicar el anticipo'
      USING ERRCODE = '23514';
  END IF;

  -- Bloqueo de la factura: el guard recalcula el saldo con ella tomada.
  PERFORM 1 FROM public.proveedor_facturas
   WHERE id = v_pago.proveedor_factura_id FOR UPDATE;

  IF p_expected_updated_at IS NOT NULL
     AND v_pago.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'LC_CONFLICTO_CONCURRENCIA: otro usuario editó este pago; recarga antes de guardar'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.pagos_proveedor SET
    fecha_pago = p_fecha_pago,
    monto = p_monto,
    moneda = p_moneda::moneda,
    tipo_cambio_usd = NULLIF(COALESCE(p_tipo_cambio_usd, 0), 0),
    metodo_pago = p_metodo_pago,
    referencia = COALESCE(p_referencia, ''),
    cuenta_bancaria_id = p_cuenta_bancaria_id,
    notas = COALESCE(p_notas, ''),
    diferencia_cambiaria_mxn = p_diferencia_cambiaria_mxn
  WHERE id = p_pago_id;

  -- Reemplazo del movimiento: sólo la línea DERIVADA del sistema se da de baja.
  -- Una línea importada del estado de cuenta jamás se borra: se desvincula.
  UPDATE public.bbva_movimientos
     SET pago_proveedor_id = NULL, estado_conciliacion = 'Pendiente',
         conciliado_por = NULL, conciliado_at = NULL
   WHERE pago_proveedor_id = p_pago_id
     AND deleted_at IS NULL
     AND COALESCE(origen::text, '') <> 'sistema';

  UPDATE public.bbva_movimientos
     SET deleted_at = now(), deleted_by = auth.uid()
   WHERE deleted_at IS NULL
     AND COALESCE(origen::text, '') = 'sistema'
     AND (pago_proveedor_id = p_pago_id OR hash_dedupe = 'pago-' || p_pago_id::text);

  IF p_cuenta_bancaria_id IS NOT NULL THEN
    v_mov_id := public._asegurar_movimiento_pago_proveedor(p_pago_id);
    IF v_mov_id IS NULL THEN
      RAISE EXCEPTION 'LC_MOVIMIENTO_NO_CREADO: no se pudo regenerar la salida bancaria del pago'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN jsonb_build_object('pago_id', p_pago_id, 'movimiento_id', v_mov_id,
                            'movimiento_creado', v_mov_id IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_pago_proveedor_atomico(uuid, date, numeric, text, numeric, text, text, uuid, text, numeric, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.actualizar_pago_proveedor_atomico(uuid, date, numeric, text, numeric, text, text, uuid, text, numeric, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.actualizar_pago_proveedor_atomico(uuid, date, numeric, text, numeric, text, text, uuid, text, numeric, timestamptz) TO authenticated, service_role;

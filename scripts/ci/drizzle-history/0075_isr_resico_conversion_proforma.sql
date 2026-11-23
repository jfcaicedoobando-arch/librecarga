-- Convert approved fiscal proformas into currency-specific drafts with frozen tax provenance.
ALTER TABLE public.facturas ADD COLUMN evaluacion_fiscal jsonb;
ALTER TABLE public.facturas ADD CONSTRAINT factura_evaluacion_fiscal_objeto_chk CHECK (
  evaluacion_fiscal IS NULL OR jsonb_typeof(evaluacion_fiscal) = 'object');
ALTER TABLE public.conceptos_factura ADD COLUMN origen_fiscal jsonb;
ALTER TABLE public.conceptos_factura ADD CONSTRAINT concepto_factura_origen_fiscal_objeto_chk CHECK (
  origen_fiscal IS NULL OR jsonb_typeof(origen_fiscal) = 'object');

-- Verify the accepted capture against the current tenant identity and its locked source rows.
CREATE OR REPLACE FUNCTION public._isr_validar_conversion_proforma(p_proforma_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_proforma public.proformas;
  v_lineas jsonb;
  v_evaluacion jsonb;
  v_snapshot jsonb;
BEGIN
  SELECT * INTO v_proforma FROM public.proformas p
  WHERE p.id = p_proforma_id AND p.organization_id = public.org_scope() FOR UPDATE;
  IF NOT FOUND OR NOT public.has_any_role_in_org_exact(auth.uid(),
    ARRAY['admin','admin_org','contador']::public.app_role[], v_proforma.organization_id) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF v_proforma.deleted_at IS NOT NULL OR v_proforma.estado_proforma NOT IN ('pendiente','aprobada')
    OR v_proforma.estado_cliente <> 'aceptada' OR v_proforma.consolidada_en IS NOT NULL
    OR v_proforma.factura_id IS NOT NULL OR v_proforma.factura_secundaria_id IS NOT NULL
    OR v_proforma.folio_factura_externa IS NOT NULL
    OR v_proforma.evaluacion_fiscal->>'estado' IS DISTINCT FROM 'confirmado'
    OR NOT public._isr_documento_habilitado(v_proforma.organization_id)
    OR jsonb_typeof(v_proforma.conceptos_fiscales) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_proforma.conceptos_fiscales) = 0
    OR (v_proforma.es_consolidada AND v_proforma.estado_revision <> 'aprobada')
    OR (v_proforma.es_consolidada AND v_proforma.ajuste_consolidacion_aprobado_at IS NULL
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_proforma.evaluacion_fiscal->'ajustes_consolidacion') a
        WHERE (a->>'diferencia')::numeric <> 0)) THEN
    RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
  END IF;

  PERFORM c.id FROM public.conceptos_venta c WHERE c.proforma_id = p_proforma_id
    AND c.organization_id = v_proforma.organization_id AND c.deleted_at IS NULL ORDER BY c.id FOR UPDATE;
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) INTO v_lineas
  FROM public.conceptos_venta c WHERE c.proforma_id = p_proforma_id AND c.organization_id = v_proforma.organization_id
    AND c.embarque_id = v_proforma.embarque_id AND c.estado_facturacion = 'en_proforma' AND c.deleted_at IS NULL;
  IF v_lineas IS NULL OR jsonb_array_length(v_lineas) <> jsonb_array_length(v_proforma.conceptos_fiscales)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_lineas) l WHERE
      (v_proforma.conceptos_fiscales @> jsonb_build_array(public._isr_concepto_proforma_normal(l))) IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
  END IF;

  -- Active sales retain the original issuer and recipient identity, including their RFCs.
  v_evaluacion := public._evaluar_documento_isr_resico(v_proforma.organization_id, v_proforma.cliente_id, v_lineas);
  v_snapshot := v_evaluacion->'snapshot';
  IF v_lineas IS DISTINCT FROM v_evaluacion->'conceptos' OR v_snapshot->>'estado' IS DISTINCT FROM 'confirmado'
    OR (v_snapshot->'ambiente', v_snapshot->'perfil_id', v_snapshot->'perfil_version', v_snapshot->'regla_version',
      v_snapshot->'precision_version', v_snapshot->'bloques') IS DISTINCT FROM
       (v_proforma.evaluacion_fiscal->'ambiente', v_proforma.evaluacion_fiscal->'perfil_id',
        v_proforma.evaluacion_fiscal->'perfil_version', v_proforma.evaluacion_fiscal->'regla_version',
        v_proforma.evaluacion_fiscal->'precision_version', v_proforma.evaluacion_fiscal->'bloques') THEN
    RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
  END IF;
  RETURN v_proforma.evaluacion_fiscal || jsonb_build_object(
    'emisor', v_lineas#>'{0,evaluacion_fiscal,emisor}', 'receptor', v_lineas#>'{0,evaluacion_fiscal,receptor}');
END;
$$;

CREATE OR REPLACE FUNCTION public._isr_insertar_conceptos_factura(p_factura_id uuid,
  p_proforma_id uuid, p_org uuid, p_es_consolidada boolean, p_moneda public.moneda)
RETURNS void LANGUAGE sql SET search_path = pg_catalog, public, pg_temp AS $$
  WITH filas AS (
    -- Grouped captures preserve the exact price basis and their complete source lineage.
    SELECT c.descripcion, c.cantidad, c.precio_unitario, c.tipo_iva, c.tasa_iva_aplicada, c.total,
      c.tasa_ret_isr, c.monto_ret_isr, p.embarque_id,
      jsonb_build_object('grupo_id', c.id, 'lineas', c.linaje_fiscal, 'evaluacion', c.evaluacion_fiscal) origen
    FROM public.proforma_conceptos_consolidados c
    JOIN public.proformas p ON p.id = c.proforma_id AND p.organization_id = c.organization_id
    WHERE p_es_consolidada AND c.proforma_id = p_proforma_id AND c.organization_id = p_org
      AND c.moneda = p_moneda AND c.deleted_at IS NULL AND c.linaje_fiscal IS NOT NULL
    UNION ALL
    SELECT l->>'descripcion', (l->>'cantidad')::numeric, (l->>'precio_unitario')::numeric, l->>'tipo_iva',
      (l->>'tasa_iva_aplicada')::numeric, (l->>'total')::numeric,
      (l->>'tasa_ret_isr')::numeric, (l->>'monto_ret_isr')::numeric, p.embarque_id,
      jsonb_build_object('lineas', jsonb_build_array(jsonb_build_object('proforma_id', p.id, 'concepto_venta_id', l->'id')),
        'evaluacion', l->'evaluacion_fiscal')
    FROM public.proformas p CROSS JOIN LATERAL jsonb_array_elements(p.conceptos_fiscales) l
    WHERE NOT p_es_consolidada AND p.id = p_proforma_id AND p.organization_id = p_org AND l->>'moneda' = p_moneda::text
  )
  INSERT INTO public.conceptos_factura (factura_id, descripcion, cantidad, precio_unitario, moneda,
    total, organization_id, clave_sat, tipo_iva, tasa_iva_aplicada, tasa_ret_isr, monto_ret_isr,
    embarque_id, proforma_id_origen, origen_fiscal)
  SELECT p_factura_id, f.descripcion, f.cantidad, f.precio_unitario, p_moneda,
    f.total, p_org, COALESCE(public.resolver_clave_sat(p_org, f.descripcion), '78101800'), f.tipo_iva,
    CASE WHEN f.tipo_iva IN ('no_objeto','exento') THEN NULL ELSE f.tasa_iva_aplicada END,
    f.tasa_ret_isr, f.monto_ret_isr, f.embarque_id, p_proforma_id, f.origen
  FROM filas f;
$$;

-- R4: preserva las guardas fiscales y rechaza filas ambiguas antes de insertar.
CREATE OR REPLACE FUNCTION public._convertir_proformas_insertar_conceptos(p_factura_id uuid, p_proforma_ids uuid[], p_org uuid, p_es_consolidada boolean, p_moneda moneda)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_proforma_fiscal uuid;
BEGIN
  SELECT f.proforma_id INTO v_proforma_fiscal FROM public.facturas f WHERE f.id = p_factura_id
    AND f.organization_id = p_org AND f.evaluacion_fiscal IS NOT NULL AND f.moneda = p_moneda;
  IF v_proforma_fiscal IS NOT NULL THEN
    IF p_proforma_ids IS DISTINCT FROM ARRAY[v_proforma_fiscal] OR EXISTS (
      SELECT 1 FROM public.conceptos_factura c WHERE c.factura_id = p_factura_id
    ) THEN RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514'; END IF;
    PERFORM public._isr_insertar_conceptos_factura(p_factura_id, v_proforma_fiscal, p_org, p_es_consolidada, p_moneda);
    RETURN;
  END IF;
  IF p_es_consolidada THEN
    PERFORM public._assert_iva_proforma_coherente(tipo_iva, tasa_iva_aplicada, aplica_iva)
      FROM public.proforma_conceptos_consolidados
     WHERE proforma_id = ANY(p_proforma_ids) AND deleted_at IS NULL;
    INSERT INTO public.conceptos_factura (
      factura_id, descripcion, cantidad, precio_unitario, moneda, total, organization_id, clave_sat,
      tipo_iva, tasa_iva_aplicada, embarque_id, proforma_id_origen
    )
    SELECT p_factura_id, pcc.descripcion, pcc.cantidad, pcc.precio_unitario,
           pcc.moneda, pcc.total, p_org,
           COALESCE(public.resolver_clave_sat(p_org, pcc.descripcion), '78101800'),
           -- B16: si la línea NO aplica IVA, se persiste exento y tasa NULL sin
           -- importar que arrastre una tasa legacy (p. ej. 0.16).
           -- El tipo explícito manda; 'no_objeto' (SAT 01) no es inferible.
           CASE WHEN pcc.tipo_iva IS NOT NULL THEN pcc.tipo_iva
                ELSE public._tipo_iva_desde_tasa(
                  pcc.aplica_iva,
                  CASE WHEN pcc.aplica_iva = false THEN NULL ELSE COALESCE(pcc.tasa_iva_aplicada, 0.16) END)
           END,
           -- P1 · Auditoría IVA: la tasa la manda el TRATAMIENTO (canónica);
           -- una tasa numérica ausente o contradictoria ya no se resuelve al 16%.
           CASE WHEN pcc.tipo_iva = 'no_objeto' THEN NULL
                WHEN pcc.aplica_iva = false THEN NULL
                ELSE public._tasa_iva_canonica(pcc.tipo_iva, pcc.tasa_iva_aplicada, pcc.aplica_iva) END,
           p.embarque_id, pcc.proforma_id
    FROM public.proforma_conceptos_consolidados pcc
    JOIN public.proformas p ON p.id = pcc.proforma_id
    WHERE pcc.proforma_id = ANY(p_proforma_ids)
      AND pcc.moneda = p_moneda
      AND pcc.deleted_at IS NULL;
  ELSE
    PERFORM public._assert_iva_proforma_coherente(tipo_iva, tasa_iva_aplicada, aplica_iva)
      FROM public.conceptos_venta
     WHERE proforma_id = ANY(p_proforma_ids) AND deleted_at IS NULL;
    INSERT INTO public.conceptos_factura (
      factura_id, descripcion, cantidad, precio_unitario, moneda, total, organization_id, clave_sat,
      tipo_iva, tasa_iva_aplicada, embarque_id, proforma_id_origen
    )
    SELECT p_factura_id, cv.descripcion, cv.cantidad, cv.precio_unitario,
           -- BUG-17: el total del renglón se guarda redondeado a 2 decimales,
           -- igual que en la rama consolidada (pcc.total ya viene redondeado).
           cv.moneda, ROUND(cv.cantidad * cv.precio_unitario, 2), p_org,
           COALESCE(public.resolver_clave_sat(p_org, cv.descripcion), '78101800'),
           CASE WHEN cv.tipo_iva IS NOT NULL THEN cv.tipo_iva
                ELSE public._tipo_iva_desde_tasa(
                  cv.aplica_iva,
                  CASE WHEN cv.aplica_iva = false THEN NULL ELSE COALESCE(cv.tasa_iva_aplicada, 0.16) END)
           END,
           CASE WHEN cv.tipo_iva = 'no_objeto' THEN NULL
                WHEN cv.aplica_iva = false THEN NULL
                ELSE public._tasa_iva_canonica(cv.tipo_iva, cv.tasa_iva_aplicada, cv.aplica_iva) END,
           p.embarque_id, cv.proforma_id
    FROM public.conceptos_venta cv
    JOIN public.proformas p ON p.id = cv.proforma_id
    WHERE cv.proforma_id = ANY(p_proforma_ids)
      AND cv.moneda = p_moneda
      AND cv.deleted_at IS NULL;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public._convertir_proformas_insertar_conceptos(uuid, uuid[], uuid, boolean, moneda) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._convertir_proformas_insertar_conceptos(uuid, uuid[], uuid, boolean, moneda) TO service_role;

CREATE OR REPLACE FUNCTION public._isr_convertir_proforma_a_facturas(p_proforma_id uuid, p_serie_id uuid,
  p_metodo text, p_forma text, p_uso text, p_dias int, p_notas text, p_fecha date)
RETURNS uuid[] LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_proforma public.proformas;
  v_evaluacion jsonb;
  v_bloque jsonb;
  v_factura public.facturas;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_moneda public.moneda;
BEGIN
  v_evaluacion := public._isr_validar_conversion_proforma(p_proforma_id);
  SELECT * INTO STRICT v_proforma FROM public.proformas WHERE id = p_proforma_id;
  FOR v_bloque IN SELECT value FROM jsonb_array_elements(v_evaluacion->'bloques') ORDER BY value->>'moneda' LOOP
    IF (v_bloque->>'subtotal')::numeric <= 0 THEN CONTINUE; END IF;
    v_moneda := (v_bloque->>'moneda')::public.moneda;
    INSERT INTO public.facturas (numero, embarque_id, expediente, cliente_id, cliente_nombre,
      moneda, fecha_emision, fecha_vencimiento, estado, organization_id, proforma_id, serie_id,
      rfc_cliente, uso_cfdi, forma_pago, metodo_pago, dias_credito, notas, origen, evaluacion_fiscal)
    VALUES ('BORRADOR-' || left(replace(gen_random_uuid()::text, '-', ''), 12), v_proforma.embarque_id,
      v_proforma.expediente, v_proforma.cliente_id, v_proforma.cliente_nombre, v_moneda,
      p_fecha, p_fecha + p_dias, 'Borrador', v_proforma.organization_id, p_proforma_id, p_serie_id,
      v_evaluacion#>>'{receptor,rfc}', p_uso, p_forma, p_metodo, p_dias, p_notas, 'conversion_proforma',
      v_evaluacion || jsonb_build_object('bloques', jsonb_build_array(v_bloque), 'proforma_id', p_proforma_id))
    RETURNING * INTO v_factura;

    PERFORM public._convertir_proformas_insertar_conceptos(v_factura.id, ARRAY[p_proforma_id],
      v_proforma.organization_id, v_proforma.es_consolidada, v_moneda);
    SELECT * INTO STRICT v_factura FROM public.facturas WHERE id = v_factura.id;
    IF (v_factura.subtotal, v_factura.iva, v_factura.ret_isr, v_factura.ret_iva, v_factura.total)
      IS DISTINCT FROM ((v_bloque->>'subtotal')::numeric, (v_bloque->>'iva')::numeric,
        (v_bloque->>'ret_isr')::numeric, (v_bloque->>'ret_iva')::numeric, (v_bloque->>'total')::numeric) THEN
      RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.factura_embarques (factura_id, embarque_id, organization_id)
    VALUES (v_factura.id, v_proforma.embarque_id, v_proforma.organization_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.bitacora_actividad (
      organization_id, usuario_id, usuario_email, accion, modulo, entidad_id, entidad_nombre, detalles
    ) VALUES (v_proforma.organization_id, auth.uid(), (SELECT email FROM auth.users WHERE id=auth.uid()),
      'factura.borrador_generado', 'facturacion', v_factura.id, v_factura.numero,
      jsonb_build_object('proforma_ids', ARRAY[p_proforma_id], 'serie_id', p_serie_id, 'moneda', v_moneda,
        'embarque_ids', ARRAY[v_proforma.embarque_id], 'huella_fiscal', v_evaluacion->'conceptos_fingerprint'));
    v_ids := array_append(v_ids, v_factura.id);
  END LOOP;
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
  END IF;

  UPDATE public.proformas
  SET estado_proforma = 'facturada', fecha_facturacion = p_fecha, factura_id = v_ids[1],
    factura_secundaria_id = v_ids[2], updated_at = now()
  WHERE id = p_proforma_id;
  RETURN v_ids;
END;
$$;

-- Fuente canónica de public.convertir_proformas_a_factura
-- Regenerada desde DB. Cada cambio DEBE actualizarse aquí en el mismo PR que la migración correspondiente.
-- Ver supabase/schema/README.md.
-- Base: 20260913000400_r170_02_fecha_negocio_mx.sql (fecha de negocio MX).
-- Última migración: v13.823.381 (C30 — cada proforma origen queda enlazada a la
-- factura resultante: `factura_id` a la principal y `factura_secundaria_id` a la
-- segunda cuando se generan MXN + USD; una única factura USD queda primaria.)
-- Previa: v13.823.376 (B12 — el INSERT de la factura USD ya no
-- inventa tipo_cambio = 1: pasa NULL explícito. El trigger BEFORE INSERT
-- _factura_tc_dof_obligatorio resuelve el T/C DOF o rechaza el INSERT, por lo
-- que el borrador nunca queda persistido sin T/C; el NULL es documental.)

CREATE OR REPLACE FUNCTION public.convertir_proformas_a_factura(p_proforma_ids uuid[], p_serie_id uuid, p_metodo_pago text, p_forma_pago text, p_uso_cfdi text, p_dias_credito integer DEFAULT NULL::integer, p_notas text DEFAULT NULL::text, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF facturas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cached jsonb; v_count int; v_first public.proformas;
  v_org uuid; v_caller_org uuid; v_cliente public.clientes;
  v_serie public.factura_series;
  v_subtotal_usd numeric := 0; v_iva_usd numeric := 0; v_total_usd numeric := 0;
  v_subtotal_mxn numeric := 0; v_iva_mxn numeric := 0; v_total_mxn numeric := 0;
  v_distinct_cli int; v_distinct_org int; v_distinct_tipo int; v_distinct_dias int;
  v_factura_ids uuid[] := ARRAY[]::uuid[];
  v_factura_mxn_id uuid; v_factura_usd_id uuid;
  v_numero_tmp text; v_embarque_ids uuid[];
  v_dias int;
  -- R170-02: fecha de negocio en hora México, no CURRENT_DATE (UTC).
  v_hoy_mx date := (now() AT TIME ZONE 'America/Mexico_City')::date;
BEGIN
  IF p_proforma_ids IS NULL OR array_length(p_proforma_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Debes proporcionar al menos una proforma';
  END IF;
  IF p_metodo_pago NOT IN ('PUE', 'PPD') THEN
    RAISE EXCEPTION 'Método de pago inválido: %', p_metodo_pago;
  END IF;
  IF coalesce(p_forma_pago, '') = '' OR coalesce(p_uso_cfdi, '') = '' THEN
    RAISE EXCEPTION 'forma_pago y uso_cfdi son obligatorios';
  END IF;

  PERFORM public.convertir_proformas_a_factura_check_embarque_vivo(p_proforma_ids);

  v_caller_org := public.current_user_org_id();

  IF NOT (
    public.es_escritor_financiero(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'LC_PROFORMA_SIN_PERMISO: rol no autorizado para convertir proformas' USING ERRCODE='P0001';
  END IF;

  v_cached := public.idempotency_claim(p_request_id, 'convertir_proformas_a_factura');
  IF v_cached ? 'factura_ids' THEN
    IF v_cached ? 'proforma_ids' AND NOT (
      (v_cached->'proforma_ids') @> to_jsonb(p_proforma_ids) AND to_jsonb(p_proforma_ids) @> (v_cached->'proforma_ids')
    ) THEN
      RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE='23514';
    END IF;
    RETURN QUERY SELECT f.* FROM public.facturas f
      WHERE f.id = ANY(ARRAY(SELECT jsonb_array_elements_text(v_cached->'factura_ids'))::uuid[])
        AND f.deleted_at IS NULL
        AND (f.organization_id = v_caller_org OR public.has_role(auth.uid(), 'super_admin'::app_role))
        AND (f.evaluacion_fiscal IS NULL OR (f.organization_id = public.org_scope()
          AND public.has_any_role_in_org_exact(auth.uid(), ARRAY['admin','admin_org','contador']::public.app_role[],
            f.organization_id)));
    RETURN;
  END IF;

  PERFORM 1 FROM public.proformas
    WHERE id = ANY(p_proforma_ids) AND deleted_at IS NULL ORDER BY id FOR UPDATE;

  SELECT count(*), count(DISTINCT organization_id), count(DISTINCT cliente_id)
    INTO v_count, v_distinct_org, v_distinct_cli
  FROM public.proformas
  WHERE id = ANY(p_proforma_ids) AND deleted_at IS NULL;

  IF v_count <> array_length(p_proforma_ids, 1) THEN
    RAISE EXCEPTION 'Una o más proformas no existen o están eliminadas';
  END IF;
  IF v_distinct_org <> 1 THEN
    RAISE EXCEPTION 'Las proformas deben pertenecer a una sola organización';
  END IF;
  IF v_distinct_cli <> 1 THEN
    RAISE EXCEPTION 'Las proformas deben pertenecer a un solo cliente';
  END IF;

  SELECT * INTO v_first FROM public.proformas
    WHERE id = ANY(p_proforma_ids) ORDER BY created_at ASC LIMIT 1;

  v_org := v_first.organization_id;

  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) AND v_org IS DISTINCT FROM v_caller_org THEN
    RAISE EXCEPTION 'No puedes convertir proformas de otra organización';
  END IF;

  IF EXISTS (SELECT 1 FROM public.proformas WHERE id = ANY(p_proforma_ids) AND estado_proforma = 'cancelada') THEN
    RAISE EXCEPTION 'LC_PROFORMA_CANCELADA: crea una nueva proforma para refacturar' USING ERRCODE='P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.proformas
    WHERE id = ANY(p_proforma_ids) AND estado_proforma = 'facturada'
  ) THEN
    RAISE EXCEPTION 'LC_PROFORMA_YA_FACTURADA: una o más proformas ya fueron facturadas' USING ERRCODE='P0002';
  END IF;

  -- v13.823.279 — Candado de aceptación: la UI ya oculta la acción para
  -- proformas pendientes o rechazadas, pero la RPC podía llamarse directo y
  -- facturar sin la respuesta del cliente. Para clientes de casa, la RPC
  -- `aceptar_proforma_sin_autorizacion` deja `estado_cliente = 'aceptada'`,
  -- así que ese flujo sigue funcionando igual.
  IF EXISTS (
    SELECT 1 FROM public.proformas
    WHERE id = ANY(p_proforma_ids)
      AND deleted_at IS NULL
      AND coalesce(estado_cliente, 'pendiente') <> 'aceptada'
  ) THEN
    RAISE EXCEPTION 'LC_PROFORMA_REQUIERE_ACEPTACION: una o más proformas no están aceptadas por el cliente (pendiente o rechazada)' USING ERRCODE='P0002';
  END IF;

  -- C25 (v13.823.380) — Una proforma FUENTE ya consolidada repuntó sus
  -- conceptos a la proforma consolidada: facturarla emitiría una factura sin
  -- líneas y la marcaría facturada.
  IF EXISTS (
    SELECT 1 FROM public.proformas
    WHERE id = ANY(p_proforma_ids) AND deleted_at IS NULL
      AND estado_revision = 'consolidada'
  ) THEN
    RAISE EXCEPTION 'LC_PROFORMA_FUENTE_CONSOLIDADA: una o más proformas ya fueron consolidadas; factura la proforma consolidada, no sus fuentes' USING ERRCODE='P0002';
  END IF;

  -- C25 — La rama de conceptos (consolidados vs conceptos_venta) se elegía con
  -- `v_first.es_consolidada` para TODO el lote: mezclar tipos podía omitir
  -- líneas y marcar todas las proformas como facturadas.
  SELECT count(DISTINCT es_consolidada) INTO v_distinct_tipo
  FROM public.proformas
  WHERE id = ANY(p_proforma_ids) AND deleted_at IS NULL;
  IF COALESCE(v_distinct_tipo, 1) > 1 THEN
    RAISE EXCEPTION 'LC_PROFORMA_MEZCLA_CONSOLIDADA: no puedes fusionar proformas consolidadas con proformas individuales; convierte cada tipo por separado' USING ERRCODE='P0001';
  END IF;

  -- C25 — Condiciones de pago: sin plazo explícito, una fusión con plazos
  -- distintos elegía en silencio el de la proforma más antigua.
  IF array_length(p_proforma_ids, 1) > 1 AND COALESCE(NULLIF(p_dias_credito, 0), NULL) IS NULL THEN
    SELECT count(DISTINCT COALESCE(dias_credito, -1)) INTO v_distinct_dias
    FROM public.proformas
    WHERE id = ANY(p_proforma_ids) AND deleted_at IS NULL;
    IF COALESCE(v_distinct_dias, 1) > 1 THEN
      RAISE EXCEPTION 'LC_PROFORMA_DIAS_CREDITO_DISTINTOS: las proformas tienen plazos de crédito distintos; iguala el plazo o indica el plazo de la factura' USING ERRCODE='P0001';
    END IF;
  END IF;



  SELECT * INTO v_cliente FROM public.clientes WHERE id = v_first.cliente_id;
  IF v_cliente IS NULL THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;

  SELECT * INTO v_serie FROM public.factura_series WHERE id = p_serie_id AND organization_id = v_org;
  IF v_serie IS NULL THEN RAISE EXCEPTION 'Serie no encontrada'; END IF;

  -- Cascada de plazo de crédito: parámetro → proforma → ficha del cliente → 0.
  v_dias := COALESCE(NULLIF(p_dias_credito, 0), v_first.dias_credito, v_cliente.dias_credito, p_dias_credito, 0);

  IF EXISTS (SELECT 1 FROM public.proformas p WHERE p.id = ANY(p_proforma_ids)
    AND p.organization_id = v_org AND p.evaluacion_fiscal IS NOT NULL) THEN
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'LC_ISR_CONVERSION_REQUIERE_CONSOLIDAR' USING ERRCODE = '23514';
    END IF;
    IF NOT v_serie.activa THEN RAISE EXCEPTION 'Serie inactiva'; END IF;
    v_factura_ids := public._isr_convertir_proforma_a_facturas(v_first.id, p_serie_id, p_metodo_pago,
      p_forma_pago, p_uso_cfdi, v_dias, p_notas, v_hoy_mx);
    PERFORM public.idempotency_store(p_request_id, jsonb_build_object('factura_ids', to_jsonb(v_factura_ids),
      'proforma_ids', to_jsonb(p_proforma_ids)));
    RETURN QUERY SELECT f.* FROM public.facturas f WHERE f.id = ANY(v_factura_ids) ORDER BY f.moneda;
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT embarque_id) INTO v_embarque_ids
  FROM public.proformas
  WHERE id = ANY(p_proforma_ids) AND embarque_id IS NOT NULL;

  IF v_first.es_consolidada THEN
    SELECT
      COALESCE(SUM(CASE WHEN moneda = 'MXN'::public.moneda THEN total ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN moneda = 'USD'::public.moneda THEN total ELSE 0 END), 0)
    INTO v_subtotal_mxn, v_subtotal_usd
    FROM public.proforma_conceptos_consolidados
    WHERE proforma_id = ANY(p_proforma_ids) AND deleted_at IS NULL;
  ELSE
    SELECT
      COALESCE(SUM(CASE WHEN moneda = 'MXN'::public.moneda THEN cantidad * precio_unitario ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN moneda = 'USD'::public.moneda THEN cantidad * precio_unitario ELSE 0 END), 0)
    INTO v_subtotal_mxn, v_subtotal_usd
    FROM public.conceptos_venta
    WHERE proforma_id = ANY(p_proforma_ids) AND deleted_at IS NULL;
  END IF;

  IF v_subtotal_mxn > 0 THEN
    v_numero_tmp := 'BORRADOR-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 12);
    INSERT INTO public.facturas (
      numero, embarque_id, expediente, cliente_id, cliente_nombre,
      subtotal, iva, total, moneda, tipo_cambio,
      fecha_emision, fecha_vencimiento, estado,
      organization_id, proforma_id,
      serie_id, folio_fiscal, serie,
      rfc_cliente, uso_cfdi, forma_pago, metodo_pago, dias_credito,
      notas, origen
    ) VALUES (
      v_numero_tmp, v_first.embarque_id, v_first.expediente, v_first.cliente_id, v_first.cliente_nombre,
      0, 0, 0, 'MXN'::public.moneda, 1,
      v_hoy_mx,
      v_hoy_mx + make_interval(days => v_dias),
      'Borrador'::estado_factura, v_org,
      CASE WHEN array_length(p_proforma_ids, 1) = 1 THEN p_proforma_ids[1] ELSE NULL END,
      p_serie_id, NULL, NULL,
      v_cliente.rfc, p_uso_cfdi, p_forma_pago, p_metodo_pago, v_dias,
      p_notas, 'conversion_proforma'
    ) RETURNING id INTO v_factura_mxn_id;

    PERFORM public._convertir_proformas_insertar_conceptos(
      v_factura_mxn_id, p_proforma_ids, v_org, v_first.es_consolidada, 'MXN'::public.moneda
    );

    -- BUG-17: recalcular desde el `total` guardado del renglón (pcc.total en
    -- consolidadas), no desde cantidad*precio_unitario que puede diverger.
    SELECT
      COALESCE(SUM(total), 0),
      COALESCE(SUM(total * COALESCE(tasa_iva_aplicada, 0)), 0)
    INTO v_subtotal_mxn, v_iva_mxn
    FROM public.conceptos_factura
    WHERE factura_id = v_factura_mxn_id AND deleted_at IS NULL;
    v_subtotal_mxn := round(v_subtotal_mxn, 2);
    v_iva_mxn := round(v_iva_mxn, 2);
    v_total_mxn := v_subtotal_mxn + v_iva_mxn;

    UPDATE public.facturas
    SET subtotal = v_subtotal_mxn, iva = v_iva_mxn, total = v_total_mxn
    WHERE id = v_factura_mxn_id;

    IF v_embarque_ids IS NOT NULL THEN
      INSERT INTO public.factura_embarques (factura_id, embarque_id, organization_id)
      SELECT v_factura_mxn_id, unnest(v_embarque_ids), v_org
      ON CONFLICT DO NOTHING;
    END IF;

    v_factura_ids := array_append(v_factura_ids, v_factura_mxn_id);

    INSERT INTO public.bitacora_actividad (
      organization_id, usuario_id, usuario_email, accion, modulo, entidad_id, entidad_nombre, detalles
    ) VALUES (
      v_org, auth.uid(),
      (SELECT email FROM auth.users WHERE id = auth.uid()),
      'factura.borrador_generado', 'facturacion', v_factura_mxn_id, v_numero_tmp,
      jsonb_build_object('proforma_ids', p_proforma_ids, 'serie_id', p_serie_id, 'moneda', 'MXN',
                        'embarque_ids', to_jsonb(v_embarque_ids),
                        'nota', 'Folio interno se asignará al timbrar (FacturAPI)')
    );
  END IF;

  IF v_subtotal_usd > 0 THEN
    v_numero_tmp := 'BORRADOR-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 12);
    INSERT INTO public.facturas (
      numero, embarque_id, expediente, cliente_id, cliente_nombre,
      subtotal, iva, total, moneda, tipo_cambio,
      fecha_emision, fecha_vencimiento, estado,
      organization_id, proforma_id,
      serie_id, folio_fiscal, serie,
      rfc_cliente, uso_cfdi, forma_pago, metodo_pago, dias_credito,
      notas, origen
    ) VALUES (
      v_numero_tmp, v_first.embarque_id, v_first.expediente, v_first.cliente_id, v_first.cliente_nombre,
      0, 0, 0, 'USD'::public.moneda, NULL,
      v_hoy_mx,
      v_hoy_mx + make_interval(days => v_dias),
      'Borrador'::estado_factura, v_org,
      CASE WHEN array_length(p_proforma_ids, 1) = 1 THEN p_proforma_ids[1] ELSE NULL END,
      p_serie_id, NULL, NULL,
      v_cliente.rfc, p_uso_cfdi, p_forma_pago, p_metodo_pago, v_dias,
      p_notas, 'conversion_proforma'
    ) RETURNING id INTO v_factura_usd_id;

    PERFORM public._convertir_proformas_insertar_conceptos(
      v_factura_usd_id, p_proforma_ids, v_org, v_first.es_consolidada, 'USD'::public.moneda
    );

    -- BUG-17: recalcular desde el `total` guardado del renglón (pcc.total en
    -- consolidadas), no desde cantidad*precio_unitario que puede diverger.
    SELECT
      COALESCE(SUM(total), 0),
      COALESCE(SUM(total * COALESCE(tasa_iva_aplicada, 0)), 0)
    INTO v_subtotal_usd, v_iva_usd
    FROM public.conceptos_factura
    WHERE factura_id = v_factura_usd_id AND deleted_at IS NULL;
    v_subtotal_usd := round(v_subtotal_usd, 2);
    v_iva_usd := round(v_iva_usd, 2);
    v_total_usd := v_subtotal_usd + v_iva_usd;

    UPDATE public.facturas
    SET subtotal = v_subtotal_usd, iva = v_iva_usd, total = v_total_usd
    WHERE id = v_factura_usd_id;

    IF v_embarque_ids IS NOT NULL THEN
      INSERT INTO public.factura_embarques (factura_id, embarque_id, organization_id)
      SELECT v_factura_usd_id, unnest(v_embarque_ids), v_org
      ON CONFLICT DO NOTHING;
    END IF;

    v_factura_ids := array_append(v_factura_ids, v_factura_usd_id);

    INSERT INTO public.bitacora_actividad (
      organization_id, usuario_id, usuario_email, accion, modulo, entidad_id, entidad_nombre, detalles
    ) VALUES (
      v_org, auth.uid(),
      (SELECT email FROM auth.users WHERE id = auth.uid()),
      'factura.borrador_generado', 'facturacion', v_factura_usd_id, v_numero_tmp,
      jsonb_build_object('proforma_ids', p_proforma_ids, 'serie_id', p_serie_id, 'moneda', 'USD',
                        'embarque_ids', to_jsonb(v_embarque_ids),
                        'nota', 'Folio interno se asignará al timbrar (FacturAPI)')
    );
  END IF;

  IF array_length(v_factura_ids, 1) > 0 THEN
    -- C30 (v13.823.381): en una fusión de VARIAS proformas las facturas nacen
    -- con `proforma_id = NULL` (una factura, N proformas), así que cada fuente
    -- perdía el enlace al PDF/folio. Se enlaza desde la proforma:
    --   factura_id            → borrador principal (MXN si existe, si no el USD)
    --   factura_secundaria_id → segundo borrador cuando hay MXN + USD
    -- El flujo de una sola proforma no cambia: apunta a la(s) misma(s) factura(s).
    UPDATE public.proformas
    SET estado_proforma = 'facturada',
        fecha_facturacion = v_hoy_mx,
        factura_id = COALESCE(v_factura_mxn_id, v_factura_usd_id),
        factura_secundaria_id = CASE
          WHEN v_factura_mxn_id IS NOT NULL AND v_factura_usd_id IS NOT NULL THEN v_factura_usd_id
          ELSE NULL
        END,
        updated_at = now()
    WHERE id = ANY(p_proforma_ids) AND deleted_at IS NULL;
  END IF;

  IF p_request_id IS NOT NULL THEN
    PERFORM public.idempotency_store(p_request_id, jsonb_build_object('factura_ids', to_jsonb(v_factura_ids)));
  END IF;

  RETURN QUERY SELECT * FROM public.facturas WHERE id = ANY(v_factura_ids);
END;
$function$;

REVOKE ALL ON FUNCTION public.convertir_proformas_a_factura(uuid[], uuid, text, text, text, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convertir_proformas_a_factura(uuid[], uuid, text, text, text, integer, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._isr_guard_proforma_normal() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_propietario boolean := current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID));
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.evaluacion_fiscal IS NOT NULL AND (
      NOT v_propietario OR NEW.embarque_id IS NULL OR NEW.deleted_at IS NOT NULL
      OR (NEW.es_consolidada AND (COALESCE(cardinality(NEW.proformas_origen),0) < 2
        OR jsonb_typeof(NEW.evaluacion_fiscal->'ajustes_consolidacion') IS DISTINCT FROM 'array'))
      OR (NOT NEW.es_consolidada AND NEW.proformas_origen IS NOT NULL)
      OR NEW.ajuste_consolidacion_aprobado_at IS NOT NULL OR NEW.ajuste_consolidacion_aprobado_por IS NOT NULL
      OR NEW.factura_id IS NOT NULL OR NEW.factura_secundaria_id IS NOT NULL
      OR NEW.estado_proforma IS DISTINCT FROM 'pendiente' OR NEW.estado_cliente IS DISTINCT FROM 'pendiente'
      OR NEW.evaluacion_fiscal->>'estado' IS DISTINCT FROM 'confirmado'
      OR NEW.evaluacion_fiscal->>'organization_id' IS DISTINCT FROM NEW.organization_id::text
      OR NEW.evaluacion_fiscal->>'cliente_id' IS DISTINCT FROM NEW.cliente_id::text
    ) THEN RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.evaluacion_fiscal IS NOT NULL THEN
      RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF (NEW.evaluacion_fiscal, NEW.conceptos_fiscales) IS DISTINCT FROM (OLD.evaluacion_fiscal, OLD.conceptos_fiscales) THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  IF OLD.evaluacion_fiscal IS NULL THEN RETURN NEW; END IF;
  IF (NEW.organization_id, NEW.cliente_id, NEW.embarque_id, NEW.es_consolidada, NEW.deleted_at,
      NEW.subtotal_usd, NEW.iva_usd, NEW.total_usd, NEW.subtotal_mxn, NEW.iva_mxn, NEW.total_mxn, NEW.tasa_iva_aplicada,
      NEW.proformas_origen, NEW.embarques_ids, NEW.cliente_nombre)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.cliente_id, OLD.embarque_id, OLD.es_consolidada, OLD.deleted_at,
      OLD.subtotal_usd, OLD.iva_usd, OLD.total_usd, OLD.subtotal_mxn, OLD.iva_mxn, OLD.total_mxn, OLD.tasa_iva_aplicada,
      OLD.proformas_origen, OLD.embarques_ids, OLD.cliente_nombre) THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  IF NEW.folio_factura_externa IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE = '23514';
  END IF;
  IF (NEW.estado_proforma, NEW.factura_id, NEW.factura_secundaria_id) IS DISTINCT FROM
      (OLD.estado_proforma, OLD.factura_id, OLD.factura_secundaria_id)
    AND (NEW.estado_proforma = 'facturada' OR OLD.estado_proforma = 'facturada'
      OR NEW.factura_id IS NOT NULL OR NEW.factura_secundaria_id IS NOT NULL) THEN
    IF NOT v_propietario OR OLD.estado_proforma = 'cancelada' OR NEW.estado_cliente <> 'aceptada'
      OR NOT ((NEW.estado_proforma = 'facturada' AND COALESCE(NEW.factura_id, NEW.factura_secundaria_id) IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY[NEW.factura_id, NEW.factura_secundaria_id]) AS vinculo(id)
          LEFT JOIN public.facturas f ON f.id = vinculo.id
          WHERE vinculo.id IS NOT NULL AND (f.proforma_id IS DISTINCT FROM NEW.id
            OR f.organization_id IS DISTINCT FROM NEW.organization_id OR f.deleted_at IS NOT NULL
            OR f.evaluacion_fiscal->'conceptos_fingerprint' IS DISTINCT FROM NEW.evaluacion_fiscal->'conceptos_fingerprint')))
        OR (OLD.estado_proforma = 'facturada' AND NEW.estado_proforma = 'pendiente'
          AND NEW.factura_id IS NULL AND NEW.factura_secundaria_id IS NULL)) THEN
      RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.consolidada_en IS DISTINCT FROM OLD.consolidada_en THEN
    IF NOT v_propietario OR OLD.es_consolidada OR OLD.consolidada_en IS NOT NULL
      OR NEW.estado_revision IS DISTINCT FROM 'consolidada' OR NEW.token_publico IS NOT NULL OR NEW.token_expira_at IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM public.proformas p WHERE p.id = NEW.consolidada_en AND p.es_consolidada
        AND p.organization_id = OLD.organization_id AND p.cliente_id = OLD.cliente_id AND p.embarque_id = OLD.embarque_id
        AND p.evaluacion_fiscal IS NOT NULL AND OLD.id = ANY(p.proformas_origen)) THEN
      RAISE EXCEPTION 'LC_ISR_CONSOLIDACION_INCOMPATIBLE' USING ERRCODE = '23514';
    END IF;
  ELSIF OLD.consolidada_en IS NOT NULL AND (
    NEW.estado_proforma, NEW.estado_cliente, NEW.estado_revision, NEW.estado_aprobacion,
    NEW.token_publico, NEW.token_expira_at, NEW.enviada_at, NEW.enviada_por
  ) IS DISTINCT FROM (
    OLD.estado_proforma, OLD.estado_cliente, OLD.estado_revision, OLD.estado_aprobacion,
    OLD.token_publico, OLD.token_expira_at, OLD.enviada_at, OLD.enviada_por
  ) THEN RAISE EXCEPTION 'LC_PROFORMA_FUENTE_CONSOLIDADA' USING ERRCODE = '23514'; END IF;

  IF (NEW.ajuste_consolidacion_aprobado_at, NEW.ajuste_consolidacion_aprobado_por)
    IS DISTINCT FROM (OLD.ajuste_consolidacion_aprobado_at, OLD.ajuste_consolidacion_aprobado_por) THEN
    IF NOT v_propietario OR NOT OLD.es_consolidada OR OLD.ajuste_consolidacion_aprobado_at IS NOT NULL
      OR NEW.ajuste_consolidacion_aprobado_at IS NULL OR NEW.ajuste_consolidacion_aprobado_por IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'LC_ISR_CONSOLIDACION_APROBACION' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.es_consolidada AND NEW.ajuste_consolidacion_aprobado_at IS NULL
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.evaluacion_fiscal->'ajustes_consolidacion') a
      WHERE (a->>'diferencia')::numeric <> 0)
    AND (NEW.estado_cliente = 'aceptada' OR NEW.estado_revision = 'aprobada' OR NEW.estado_aprobacion = 'aprobada'
      OR NEW.estado_proforma = 'aprobada' OR NEW.token_publico IS NOT NULL OR NEW.enviada_at IS NOT NULL) THEN
    RAISE EXCEPTION 'LC_ISR_CONSOLIDACION_APROBACION' USING ERRCODE = '23514';
  END IF;
  IF OLD.estado_cliente = 'rechazada' AND NEW.estado_cliente IS DISTINCT FROM OLD.estado_cliente THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._isr_validar_vinculo_proforma_normal(p_anterior jsonb, p_nuevo jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_anterior uuid := (p_anterior->>'proforma_id')::uuid;
  v_nuevo uuid := (p_nuevo->>'proforma_id')::uuid;
  v_proforma public.proformas;
  v_destino public.proformas;
  v_linea jsonb := public._isr_concepto_proforma_normal(p_anterior);
BEGIN
  IF (p_anterior->'organization_id', p_anterior->'embarque_id', p_anterior->'deleted_at', p_anterior->'evaluacion_fiscal')
    IS DISTINCT FROM (p_nuevo->'organization_id', p_nuevo->'embarque_id', p_nuevo->'deleted_at', p_nuevo->'evaluacion_fiscal')
    OR v_linea IS DISTINCT FROM public._isr_concepto_proforma_normal(p_nuevo) THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_proforma FROM public.proformas WHERE id = COALESCE(v_anterior, v_nuevo) FOR NO KEY UPDATE;
  IF v_proforma.id IS NULL OR v_proforma.evaluacion_fiscal IS NULL
    OR v_proforma.organization_id IS DISTINCT FROM (p_anterior->>'organization_id')::uuid
    OR v_proforma.embarque_id IS DISTINCT FROM (p_anterior->>'embarque_id')::uuid
    OR (v_proforma.conceptos_fiscales @> jsonb_build_array(v_linea)) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE = '23514';
  END IF;
  IF v_anterior IS NOT NULL AND v_nuevo IS NOT NULL AND v_anterior <> v_nuevo THEN
    SELECT * INTO v_destino FROM public.proformas WHERE id = v_nuevo FOR NO KEY UPDATE;
    IF NOT v_proforma.es_consolidada AND v_proforma.consolidada_en = v_nuevo AND v_proforma.estado_revision = 'consolidada'
      AND v_destino.es_consolidada AND v_destino.evaluacion_fiscal IS NOT NULL
      AND v_destino.organization_id = v_proforma.organization_id AND v_destino.embarque_id = v_proforma.embarque_id
      AND v_destino.cliente_id = v_proforma.cliente_id AND v_destino.deleted_at IS NULL AND v_destino.estado_proforma = 'pendiente'
      AND v_anterior = ANY(v_destino.proformas_origen) AND p_nuevo->>'estado_facturacion' = 'en_proforma'
      AND v_destino.conceptos_fiscales @> jsonb_build_array(v_linea || jsonb_build_object('proforma_origen_id',v_anterior)) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'LC_ISR_CONSOLIDACION_INCOMPATIBLE' USING ERRCODE = '23514';
  END IF;
  IF v_anterior IS NOT NULL AND v_nuevo IS NULL
    AND p_nuevo->>'estado_facturacion' = 'pendiente'
    AND (v_proforma.estado_proforma = 'cancelada' OR v_proforma.estado_cliente = 'rechazada') THEN
    RETURN;
  END IF;
  IF v_anterior = v_nuevo AND v_proforma.estado_proforma = 'facturada'
    AND p_anterior->>'estado_facturacion' = 'en_proforma' AND p_nuevo->>'estado_facturacion' = 'facturado'
    AND v_proforma.deleted_at IS NULL AND v_proforma.estado_cliente = 'aceptada'
    AND COALESCE(v_proforma.factura_id, v_proforma.factura_secundaria_id) IS NOT NULL THEN
    RETURN;
  END IF;
  IF (v_anterior IS NULL OR v_anterior = v_nuevo) AND v_nuevo IS NOT NULL
    AND (v_anterior IS NOT NULL OR NOT v_proforma.es_consolidada)
    AND p_nuevo->>'estado_facturacion' = 'en_proforma' AND v_proforma.deleted_at IS NULL
    AND v_proforma.estado_proforma IN ('pendiente', 'aprobada') AND v_proforma.estado_cliente <> 'rechazada' THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE = '23514';
END;
$$;

-- Candidato forward 20261011180000; CREATE OR REPLACE conserva ACL.
CREATE OR REPLACE FUNCTION public.tg_facturas_link_proforma() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_estado_proforma text;
BEGIN
  -- The evaluated conversion owns both currency links and publishes them atomically.
  IF NEW.evaluacion_fiscal IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.proforma_id IS NOT NULL AND NEW.deleted_at IS NULL
     AND NEW.estado NOT IN ('Cancelada'::estado_factura,'Sustituida'::estado_factura) THEN
    -- Lock de proforma: mismo orden lógico que cancelar/convertir.
    SELECT estado_proforma INTO v_estado_proforma FROM public.proformas
    WHERE id = NEW.proforma_id AND organization_id = NEW.organization_id FOR UPDATE;
    IF v_estado_proforma = 'cancelada' THEN
      IF TG_OP = 'INSERT' THEN
        RAISE EXCEPTION 'LC_PROFORMA_CANCELADA: no se puede facturar una proforma cancelada' USING ERRCODE='P0001';
      ELSIF NEW.proforma_id IS DISTINCT FROM OLD.proforma_id
         OR OLD.deleted_at IS NOT NULL
         OR OLD.estado IN ('Cancelada'::estado_factura,'Sustituida'::estado_factura) THEN
        RAISE EXCEPTION 'LC_PROFORMA_CANCELADA: no se puede reactivar la factura de una proforma cancelada' USING ERRCODE='P0001';
      END IF;
      IF OLD.estado IN ('Borrador'::estado_factura,'Por timbrar'::estado_factura)
         AND NEW.estado IS DISTINCT FROM OLD.estado THEN
        RAISE EXCEPTION 'LC_PROFORMA_CANCELADA: no se puede emitir un borrador del histórico cancelado' USING ERRCODE='P0001';
      END IF;
      -- Facturas históricas existentes conservan su vínculo sin reactivar proforma.
      RETURN NEW;
    END IF;
    UPDATE public.proformas
       SET factura_id = NEW.id
     WHERE id = NEW.proforma_id
       AND (factura_id IS NULL OR factura_id <> NEW.id)
       AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public._isr_guard_conversion_factura() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_proforma_id uuid := (to_jsonb(NEW)->>CASE WHEN TG_TABLE_NAME = 'facturas' THEN 'proforma_id' ELSE 'proforma_id_origen' END)::uuid;
BEGIN
  -- Separate invoker triggers authenticate and freeze rows carrying the evaluated conversion.
  IF (TG_TABLE_NAME = 'facturas' AND to_jsonb(NEW)->>'evaluacion_fiscal' IS NOT NULL)
    OR (TG_TABLE_NAME = 'conceptos_factura' AND to_jsonb(NEW)->>'origen_fiscal' IS NOT NULL) THEN RETURN NEW; END IF;
  IF v_proforma_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'conceptos_factura' THEN
    PERFORM 1 FROM public.proformas WHERE id=v_proforma_id FOR NO KEY UPDATE;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.proformas WHERE id=v_proforma_id AND evaluacion_fiscal IS NOT NULL
  ) OR (TG_TABLE_NAME='conceptos_factura' AND EXISTS (
    SELECT 1 FROM public.proforma_conceptos_consolidados WHERE proforma_id=v_proforma_id AND evaluacion_fiscal IS NOT NULL
  )) THEN
    RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._isr_guard_borrador_convertido() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_propietario boolean := current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID));
  v_proforma public.proformas;
BEGIN
  IF NEW.evaluacion_fiscal IS NULL AND (TG_OP = 'INSERT' OR OLD.evaluacion_fiscal IS NULL) THEN RETURN NEW; END IF;
  IF NEW.estado <> 'Borrador' OR NEW.snapshot_emision IS NOT NULL OR NEW.uuid_fiscal IS NOT NULL
    OR NEW.facturapi_id IS NOT NULL OR NEW.facturapi_claim_at IS NOT NULL OR NEW.facturapi_pendiente_id IS NOT NULL
    OR NEW.timbrado_en IS NOT NULL OR NEW.timbrado_por IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_TIMBRADO_PENDIENTE' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT p.* INTO v_proforma FROM public.proformas p
      WHERE p.id = NEW.proforma_id AND p.organization_id = NEW.organization_id AND p.deleted_at IS NULL;
    IF NOT v_propietario OR NOT FOUND OR NEW.deleted_at IS NOT NULL OR NEW.origen <> 'conversion_proforma'
      OR v_proforma.estado_cliente <> 'aceptada' OR v_proforma.estado_proforma NOT IN ('pendiente','aprobada')
      OR v_proforma.evaluacion_fiscal IS NULL OR NEW.cliente_id IS DISTINCT FROM v_proforma.cliente_id
      OR NEW.embarque_id IS DISTINCT FROM v_proforma.embarque_id
      OR NEW.rfc_cliente IS DISTINCT FROM NEW.evaluacion_fiscal#>>'{receptor,rfc}'
      OR (NEW.evaluacion_fiscal->>'proforma_id')::uuid IS DISTINCT FROM v_proforma.id
      OR (NEW.evaluacion_fiscal - ARRAY['bloques','emisor','receptor','proforma_id'])
        IS DISTINCT FROM (v_proforma.evaluacion_fiscal - 'bloques')
      OR jsonb_array_length(NEW.evaluacion_fiscal->'bloques') IS DISTINCT FROM 1
      OR NEW.evaluacion_fiscal#>>'{bloques,0,moneda}' IS DISTINCT FROM NEW.moneda::text
      OR ((v_proforma.evaluacion_fiscal->'bloques') @> (NEW.evaluacion_fiscal->'bloques')) IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.evaluacion_fiscal, NEW.organization_id, NEW.cliente_id, NEW.embarque_id, NEW.proforma_id,
      NEW.moneda, NEW.origen, NEW.rfc_cliente, NEW.sustituye_a)
    IS DISTINCT FROM
    (OLD.evaluacion_fiscal, OLD.organization_id, OLD.cliente_id, OLD.embarque_id, OLD.proforma_id,
      OLD.moneda, OLD.origen, OLD.rfc_cliente, OLD.sustituye_a)
    OR ((NEW.deleted_at, NEW.deleted_by) IS DISTINCT FROM (OLD.deleted_at, OLD.deleted_by)
      AND (NOT v_propietario OR OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL
        OR NEW.deleted_by IS DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._isr_guard_concepto_factura_convertida() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_propietario boolean := current_user = pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID));
  v_factura public.facturas;
  v_campos_editables text[] := ARRAY['updated_at','clave_sat','clave_unidad','deleted_at','deleted_by'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.origen_fiscal IS NOT NULL THEN RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  SELECT f.* INTO v_factura FROM public.facturas f
    WHERE f.id = NEW.factura_id AND f.organization_id = NEW.organization_id;
  IF v_factura.evaluacion_fiscal IS NULL AND NEW.origen_fiscal IS NULL
    AND (TG_OP = 'INSERT' OR OLD.origen_fiscal IS NULL) THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_propietario OR v_factura.evaluacion_fiscal IS NULL OR v_factura.deleted_at IS NOT NULL
      OR NEW.deleted_at IS NOT NULL OR NEW.proforma_id_origen IS DISTINCT FROM v_factura.proforma_id
      OR NEW.embarque_id IS DISTINCT FROM v_factura.embarque_id OR NEW.moneda IS DISTINCT FROM v_factura.moneda
      OR NEW.tasa_ret_iva <> 0 OR jsonb_typeof(NEW.origen_fiscal->'lineas') IS DISTINCT FROM 'array'
      OR jsonb_array_length(NEW.origen_fiscal->'lineas') = 0
      OR (NEW.origen_fiscal#>>'{evaluacion,base_exacta}')::numeric IS DISTINCT FROM NEW.cantidad * NEW.precio_unitario
      OR NEW.tasa_ret_isr IS DISTINCT FROM (NEW.origen_fiscal#>>'{evaluacion,tasa_ret_isr}')::numeric
      OR NEW.monto_ret_isr IS DISTINCT FROM (NEW.origen_fiscal#>>'{evaluacion,monto_ret_isr}')::numeric THEN
      RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - v_campos_editables) IS DISTINCT FROM (to_jsonb(OLD) - v_campos_editables)
    OR ((NEW.deleted_at, NEW.deleted_by) IS DISTINCT FROM (OLD.deleted_at, OLD.deleted_by)
      AND (NOT v_propietario OR OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL
        OR NEW.deleted_by IS DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_factura_totales_conceptos()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_n        int;
  v_subtotal numeric;
  v_iva      numeric;
  v_isr      numeric;
  v_iva_ret  numeric;
BEGIN
  IF NEW.evaluacion_fiscal IS NOT NULL OR EXISTS(SELECT 1 FROM public.conceptos_factura c WHERE c.factura_id=NEW.id
    AND c.deleted_at IS NULL AND c.tasa_ret_isr=0.0125) THEN
    IF OLD.estado NOT IN ('Borrador','Por timbrar') OR OLD.snapshot_emision IS NOT NULL
      OR NULLIF(btrim(OLD.uuid_fiscal),'') IS NOT NULL THEN
      IF (NEW.subtotal,NEW.iva,NEW.ret_isr,NEW.ret_iva,NEW.total)
        IS DISTINCT FROM (OLD.subtotal,OLD.iva,OLD.ret_isr,OLD.ret_iva,OLD.total) THEN
        RAISE EXCEPTION 'LC_FACTURA_INMUTABLE: los totales fiscales emitidos no se recalculan' USING ERRCODE='P0001';
      END IF;
      RETURN NEW;
    END IF;
    SELECT t.subtotal,t.iva,t.ret_isr,t.ret_iva INTO v_subtotal,v_iva,v_isr,v_iva_ret
    FROM public._totales_factura_resico_agrupados(NEW.id) t;
    IF NEW.estado NOT IN ('Borrador','Por timbrar') OR NEW.snapshot_emision IS NOT NULL
      OR NULLIF(btrim(NEW.uuid_fiscal),'') IS NOT NULL THEN
      -- The freeze trigger has already captured NEW: reject, never fix after freezing.
      IF (NEW.subtotal,NEW.iva,NEW.ret_isr,NEW.ret_iva,NEW.total)
        IS DISTINCT FROM (v_subtotal,v_iva,v_isr,v_iva_ret,v_subtotal+v_iva-v_isr-v_iva_ret) THEN
        RAISE EXCEPTION 'LC_FACTURA_TOTALES_DESCUADRE: revisa los totales antes de emitir' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END IF;
    NEW.subtotal:=v_subtotal; NEW.iva:=v_iva; NEW.ret_isr:=v_isr; NEW.ret_iva:=v_iva_ret;
    NEW.total:=v_subtotal+v_iva-v_isr-v_iva_ret;
    RETURN NEW;
  END IF;
  IF TG_NAME='trg_facturas_totales_fiscal_guard' THEN RETURN NEW; END IF;
  SELECT
    count(*),
    COALESCE(SUM(ROUND(COALESCE(c.cantidad, 1) * COALESCE(c.precio_unitario, 0), 2)), 0),
    COALESCE(SUM(ROUND(
        ROUND(COALESCE(c.cantidad, 1) * COALESCE(c.precio_unitario, 0), 2)
        * COALESCE(c.tasa_iva_aplicada,
                   CASE WHEN c.tipo_iva = 'gravado_16' THEN 0.16
                        WHEN c.tipo_iva = 'gravado_8'  THEN 0.08
                        ELSE 0 END),
        2)), 0),
    COALESCE(SUM(COALESCE(c.monto_ret_isr, 0)), 0),
    COALESCE(SUM(COALESCE(c.monto_ret_iva, 0)), 0)
  INTO v_n, v_subtotal, v_iva, v_isr, v_iva_ret
  FROM public.conceptos_factura c
  WHERE c.factura_id = NEW.id
    AND c.deleted_at IS NULL;

  IF v_n > 0 THEN
    NEW.subtotal := v_subtotal;
    NEW.iva      := v_iva;
    NEW.ret_isr  := v_isr;
    NEW.ret_iva  := v_iva_ret;
    NEW.total    := v_subtotal + v_iva - v_isr - v_iva_ret;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_factura_totales_conceptos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_factura_totales_conceptos() TO authenticated, service_role;

CREATE TRIGGER zz_isr_borrador_convertido BEFORE INSERT OR UPDATE ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public._isr_guard_borrador_convertido();
CREATE TRIGGER zz_isr_concepto_factura_convertida BEFORE INSERT OR UPDATE OR DELETE ON public.conceptos_factura
  FOR EACH ROW EXECUTE FUNCTION public._isr_guard_concepto_factura_convertida();
REVOKE ALL ON FUNCTION public._isr_validar_conversion_proforma(uuid),
  public._isr_insertar_conceptos_factura(uuid,uuid,uuid,boolean,moneda),
  public._isr_convertir_proforma_a_facturas(uuid,uuid,text,text,text,int,text,date),
  public._isr_guard_borrador_convertido(), public._isr_guard_concepto_factura_convertida()
  FROM PUBLIC, anon, authenticated, service_role;

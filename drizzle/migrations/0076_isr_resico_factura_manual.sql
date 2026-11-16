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

  -- The existing manual capture keeps its invoker RLS for header and lines.
  -- Only the evaluated transition is written by the scoped fiscal function.
  IF OLD.evaluacion_fiscal IS NULL AND NEW.evaluacion_fiscal IS NOT NULL
    AND v_propietario AND (to_jsonb(NEW) - ARRAY['evaluacion_fiscal','updated_at'])
      IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['evaluacion_fiscal','updated_at'])
    AND OLD.origen = 'manual' AND OLD.deleted_at IS NULL AND OLD.proforma_id IS NULL AND OLD.embarque_id IS NULL
    AND (NEW.evaluacion_fiscal->>'factura_id')::uuid = OLD.id
    AND (NEW.evaluacion_fiscal->>'organization_id')::uuid = OLD.organization_id
    AND (NEW.evaluacion_fiscal->>'cliente_id')::uuid = OLD.cliente_id
    AND NEW.evaluacion_fiscal->>'estado' = 'confirmado'
    AND NEW.evaluacion_fiscal#>>'{receptor,rfc}' = upper(btrim(OLD.rfc_cliente))
    AND jsonb_array_length(NEW.evaluacion_fiscal->'bloques') = 1
    AND NEW.evaluacion_fiscal#>>'{bloques,0,moneda}' = OLD.moneda::text THEN
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
  IF OLD.origen_fiscal IS NULL AND NEW.origen_fiscal IS NOT NULL AND v_propietario
    AND v_factura.origen = 'manual' AND v_factura.deleted_at IS NULL AND v_factura.evaluacion_fiscal IS NOT NULL
    AND OLD.deleted_at IS NULL AND (NEW.origen_fiscal->>'captura_id')::uuid = OLD.id
    AND NEW.tasa_ret_isr = (NEW.origen_fiscal#>>'{evaluacion,tasa_ret_isr}')::numeric
    AND NEW.monto_ret_isr = (NEW.origen_fiscal#>>'{evaluacion,monto_ret_isr}')::numeric
    AND NEW.cantidad * NEW.precio_unitario = (NEW.origen_fiscal#>>'{evaluacion,base_exacta}')::numeric
    AND NEW.total = round(NEW.cantidad * NEW.precio_unitario, 2)
    AND (to_jsonb(NEW) - ARRAY['updated_at','total','tasa_ret_isr','monto_ret_isr','origen_fiscal'])
      IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['updated_at','total','tasa_ret_isr','monto_ret_isr','origen_fiscal']) THEN
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

-- The invoker capture writes through RLS first. This RPC may only freeze an eligible
-- draft using the values already stored by that writer and the current tenant profile.
CREATE OR REPLACE FUNCTION public.aplicar_evaluacion_isr_factura_manual(p_factura_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_org uuid := public.org_scope();
  v_uid uuid := auth.uid();
  v_factura public.facturas;
  v_cliente public.clientes;
  v_lineas jsonb;
  v_calculo jsonb;
  v_snapshot jsonb;
  v_bloque jsonb;
  v_ret_iva numeric;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF NOT public._isr_documento_habilitado(v_org) THEN RETURN; END IF;
  -- Match both the invoice and line writer policies for an evaluated manual draft.
  IF NOT (public.has_any_role_efectivo(v_uid, ARRAY['admin','admin_org','operador','contador','super_admin']::public.app_role[])
    AND (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'operador')
      OR public.has_role(v_uid,'contador') OR public.has_role(v_uid,'super_admin'))) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_factura FROM public.facturas WHERE id = p_factura_id AND organization_id = v_org FOR UPDATE;
  IF NOT FOUND OR v_factura.deleted_at IS NOT NULL OR v_factura.origen <> 'manual'
    OR v_factura.estado <> 'Borrador' OR v_factura.proforma_id IS NOT NULL OR v_factura.embarque_id IS NOT NULL
    OR v_factura.sustituye_a IS NOT NULL OR v_factura.snapshot_emision IS NOT NULL
    OR v_factura.facturapi_id IS NOT NULL OR v_factura.facturapi_pendiente_id IS NOT NULL
    OR v_factura.uuid_fiscal IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;
  IF v_factura.evaluacion_fiscal IS NOT NULL THEN RETURN; END IF;
  SELECT * INTO v_cliente FROM public.clientes WHERE id = v_factura.cliente_id AND organization_id = v_org
    AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND OR nullif(upper(btrim(v_factura.rfc_cliente)), '') IS DISTINCT FROM nullif(upper(btrim(v_cliente.rfc)), '') THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;

  PERFORM c.id FROM public.conceptos_factura c WHERE c.factura_id = p_factura_id AND c.deleted_at IS NULL
    ORDER BY c.id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.conceptos_factura c WHERE c.factura_id = p_factura_id AND c.deleted_at IS NULL AND (
    c.organization_id <> v_org OR c.moneda <> v_factura.moneda OR c.proforma_id_origen IS NOT NULL OR c.embarque_id IS NOT NULL
    OR c.origen_fiscal IS NOT NULL OR c.tasa_ret_iva NOT BETWEEN 0 AND 1
    OR (c.tipo_iva IN ('no_objeto','exento','tasa_0') AND c.tasa_ret_iva <> 0)
  )) THEN RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514'; END IF;
  SELECT jsonb_agg(jsonb_build_object('id', c.id, 'cantidad', c.cantidad, 'precio_unitario', c.precio_unitario,
    'moneda', c.moneda, 'tipo_iva', c.tipo_iva, 'tasa_iva_aplicada', c.tasa_iva_aplicada) ORDER BY c.id)
  INTO v_lineas FROM public.conceptos_factura c WHERE c.factura_id = p_factura_id AND c.deleted_at IS NULL;
  IF v_lineas IS NULL THEN RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514'; END IF;

  v_calculo := public._evaluar_documento_isr_resico(v_org, v_cliente.id, v_lineas);
  v_snapshot := v_calculo->'snapshot';
  v_bloque := v_snapshot#>'{bloques,0}';
  IF v_snapshot->>'estado' IS DISTINCT FROM 'confirmado' OR (v_bloque->>'total')::numeric <= 0 THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;
  -- The commercial evaluator calculates ISR. Existing IVA withholding in a
  -- manual draft keeps its own rate and uses the same 0070 grouped arithmetic.
  SELECT t.ret_iva INTO v_ret_iva FROM public._totales_factura_resico_agrupados(p_factura_id) t;
  v_bloque := v_bloque || jsonb_build_object(
    'ret_iva', v_ret_iva, 'total', (v_bloque->>'total')::numeric - v_ret_iva);
  IF (v_bloque->>'total')::numeric <= 0 THEN RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514'; END IF;
  v_snapshot := v_snapshot || jsonb_build_object('factura_id', p_factura_id, 'bloques', jsonb_build_array(v_bloque),
    'emisor', v_calculo#>'{conceptos,0,evaluacion_fiscal,emisor}',
    'receptor', (v_calculo#>'{conceptos,0,evaluacion_fiscal,receptor}') || jsonb_build_object('regimen_fiscal', v_cliente.regimen_fiscal));

  UPDATE public.facturas SET evaluacion_fiscal = v_snapshot WHERE id = p_factura_id AND organization_id = v_org;
  UPDATE public.conceptos_factura c
  SET tasa_ret_isr = (l->>'tasa_ret_isr')::numeric,
      total = (l#>>'{evaluacion_fiscal,base}')::numeric,
      origen_fiscal = jsonb_build_object('captura_id', c.id, 'evaluacion', l->'evaluacion_fiscal')
  FROM jsonb_array_elements(v_calculo->'conceptos') l
  WHERE c.factura_id = p_factura_id AND c.organization_id = v_org AND c.id = (l->>'id')::uuid AND c.deleted_at IS NULL;
  IF NOT EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = p_factura_id AND f.organization_id = v_org
    AND (f.subtotal, f.iva, f.ret_isr, f.ret_iva, f.total) =
      ((v_bloque->>'subtotal')::numeric, (v_bloque->>'iva')::numeric, (v_bloque->>'ret_isr')::numeric,
       (v_bloque->>'ret_iva')::numeric, (v_bloque->>'total')::numeric)) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.aplicar_evaluacion_isr_factura_manual(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.aplicar_evaluacion_isr_factura_manual(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.crear_factura_manual_idempotente(p_request_id uuid, p_factura jsonb, p_conceptos jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_factura public.facturas;
  v_id uuid;
  v_previa jsonb;
  v_hash text := md5(p_factura::text || p_conceptos::text);
BEGIN
  IF auth.uid() IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'La captura requiere una sesión y un identificador válido.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_factura FROM jsonb_populate_record(NULL::public.facturas, p_factura);
  IF v_factura.organization_id IS DISTINCT FROM public.org_scope() THEN
    RAISE EXCEPTION 'La captura no pertenece a la organización activa.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_conceptos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_conceptos) = 0 THEN
    RAISE EXCEPTION 'Debe haber al menos un concepto.' USING ERRCODE = '22023';
  END IF;
  v_previa := public.idempotency_claim(p_request_id, 'crear_factura_manual_idempotente');
  IF v_previa IS NOT NULL THEN
    IF v_previa->>'hash' IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'La captura ya fue enviada con otros datos. Revisa la factura guardada antes de iniciar otra captura.' USING ERRCODE = '22023';
    END IF;
    SELECT id INTO v_id FROM public.facturas
      WHERE id = (v_previa->>'factura_id')::uuid AND organization_id = v_factura.organization_id
        AND deleted_at IS NULL;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'La factura de esta captura ya no está disponible.' USING ERRCODE = '42501';
    END IF;
    RETURN v_id;
  END IF;
  -- Sólo los campos de la captura original: nunca aceptar UUID/timbre/estado
  -- fiscal, ids ajenos o borrado lógico suministrados dentro del JSON.
  INSERT INTO public.facturas (
    numero, cliente_id, cliente_nombre, rfc_cliente, subtotal, iva, total,
    moneda, tipo_cambio, fecha_emision, fecha_vencimiento, estado, origen,
    serie, uso_cfdi, forma_pago, metodo_pago, dias_credito, notas, organization_id
  ) VALUES (
    v_factura.numero, v_factura.cliente_id, v_factura.cliente_nombre, v_factura.rfc_cliente,
    v_factura.subtotal, v_factura.iva, v_factura.total, v_factura.moneda,
    v_factura.tipo_cambio, v_factura.fecha_emision, v_factura.fecha_vencimiento,
    'Borrador', 'manual', v_factura.serie, v_factura.uso_cfdi,
    v_factura.forma_pago, v_factura.metodo_pago, v_factura.dias_credito,
    v_factura.notas, v_factura.organization_id
  ) RETURNING id INTO v_id;
  INSERT INTO public.conceptos_factura (
    factura_id, descripcion, cantidad, precio_unitario, total, moneda,
    clave_sat, organization_id, tipo_iva, tasa_iva_aplicada
  ) SELECT v_id, c.descripcion, c.cantidad, c.precio_unitario, c.total,
      v_factura.moneda, c.clave_sat, v_factura.organization_id, c.tipo_iva, c.tasa_iva_aplicada
    FROM jsonb_to_recordset(p_conceptos) AS c (
      descripcion text, cantidad numeric, precio_unitario numeric, total numeric,
      clave_sat text, tipo_iva text, tasa_iva_aplicada numeric
    );
  -- El rollup fiscal de conceptos sigue siendo canónico. Una falla de línea
  -- o de bitácora revierte la captura y la reclamación de idempotencia juntas.
  PERFORM public.aplicar_evaluacion_isr_factura_manual(v_id);
  SELECT f.total INTO v_factura.total FROM public.facturas f WHERE f.id = v_id;
  PERFORM public.registrar_bitacora('facturacion', 'Creó factura manual borrador',
    v_id, v_factura.numero, jsonb_build_object('cliente', v_factura.cliente_nombre,
      'total', v_factura.total, 'moneda', v_factura.moneda));
  PERFORM public.idempotency_store(p_request_id, jsonb_build_object('factura_id', v_id, 'hash', v_hash));
  RETURN v_id;
END;
$$;

-- Verify the accepted capture against the current tenant identity and its locked source rows.
CREATE OR REPLACE FUNCTION public._isr_validar_conversion_proforma(p_proforma_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_proforma public.proformas;
  v_lineas jsonb;
  v_evaluacion jsonb;
  v_snapshot jsonb;
  v_regimen_receptor text;
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
  SELECT c.regimen_fiscal INTO v_regimen_receptor FROM public.clientes c
    WHERE c.id = v_proforma.cliente_id AND c.organization_id = v_proforma.organization_id AND c.deleted_at IS NULL;
  RETURN v_proforma.evaluacion_fiscal || jsonb_build_object(
    'emisor', v_lineas#>'{0,evaluacion_fiscal,emisor}',
    'receptor', (v_lineas#>'{0,evaluacion_fiscal,receptor}') || jsonb_build_object('regimen_fiscal', v_regimen_receptor));
END;
$$;

-- Called after scope/role authorization. Returns the expected PAC identity
-- and document totals for the emission reservation without revealing credentials.
CREATE OR REPLACE FUNCTION public._isr_revisar_factura_emision(p_factura_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_factura public.facturas;
  v_perfil public.perfiles_fiscales_emisor;
  v_cred public.facturapi_credenciales;
  v_cliente public.clientes;
  v_documento jsonb;
  v_lineas jsonb;
  v_ahora jsonb;
  v_evaluacion jsonb;
  v_bloque jsonb;
  v_totales record;
BEGIN
  SELECT * INTO STRICT v_factura FROM public.facturas WHERE id = p_factura_id AND deleted_at IS NULL;
  IF v_factura.evaluacion_fiscal IS NULL THEN
    IF public._isr_documento_habilitado(v_factura.organization_id) THEN
      RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;

  v_documento := v_factura.evaluacion_fiscal;
  v_bloque := v_documento#>'{bloques,0}';
  SELECT * INTO v_cred FROM public.facturapi_credenciales WHERE organization_id = v_factura.organization_id;
  SELECT * INTO v_perfil FROM public.perfiles_fiscales_emisor WHERE organization_id = v_factura.organization_id
    AND ambiente = v_cred.ambiente ORDER BY version DESC LIMIT 1;
  SELECT * INTO v_cliente FROM public.clientes WHERE organization_id = v_factura.organization_id
    AND id = v_factura.cliente_id AND deleted_at IS NULL;
  IF NOT public._isr_documento_habilitado(v_factura.organization_id)
    OR v_factura.estado <> 'Borrador' OR v_factura.facturapi_id IS NOT NULL OR v_factura.uuid_fiscal IS NOT NULL
    OR v_factura.snapshot_emision IS NOT NULL OR v_factura.facturapi_pendiente_id IS NOT NULL
    OR v_documento->>'estado' IS DISTINCT FROM 'confirmado'
    OR v_documento->>'organization_id' IS DISTINCT FROM v_factura.organization_id::text
    OR v_documento->>'cliente_id' IS DISTINCT FROM v_factura.cliente_id::text
    OR v_documento->>'ambiente' IS DISTINCT FROM v_cred.ambiente
    OR v_documento->>'perfil_id' IS DISTINCT FROM v_perfil.id::text
    OR v_documento->>'perfil_version' IS DISTINCT FROM v_perfil.version::text
    OR v_cred.facturapi_org_id IS NULL OR v_cred.facturapi_org_id IS DISTINCT FROM v_perfil.facturapi_org_id
    OR v_bloque->>'moneda' IS DISTINCT FROM v_factura.moneda::text OR v_cliente.id IS NULL
    OR v_documento#>>'{receptor,rfc}' IS DISTINCT FROM upper(btrim(v_cliente.rfc))
    OR v_documento#>>'{receptor,rfc}' IS DISTINCT FROM upper(btrim(v_factura.rfc_cliente))
    OR (v_documento->'receptor' ? 'regimen_fiscal'
      AND v_documento#>>'{receptor,regimen_fiscal}' IS DISTINCT FROM v_cliente.regimen_fiscal) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', c.id, 'cantidad', c.cantidad, 'precio_unitario', c.precio_unitario,
    'moneda', c.moneda, 'tipo_iva', c.tipo_iva, 'tasa_iva_aplicada', c.tasa_iva_aplicada) ORDER BY c.id)
  INTO v_lineas FROM public.conceptos_factura c WHERE c.factura_id = p_factura_id AND c.deleted_at IS NULL;
  IF v_lineas IS NULL THEN RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514'; END IF;
  v_ahora := public._evaluar_documento_isr_resico(v_factura.organization_id, v_factura.cliente_id, v_lineas);
  v_evaluacion := v_ahora->'snapshot';
  IF v_evaluacion->>'estado' IS DISTINCT FROM 'confirmado'
    OR (v_evaluacion->>'regla_version',v_evaluacion->>'precision_version')
      IS DISTINCT FROM (v_documento->>'regla_version', v_documento->>'precision_version')
    OR v_ahora#>'{conceptos,0,evaluacion_fiscal,emisor}' IS DISTINCT FROM v_documento->'emisor'
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_ahora->'conceptos') l JOIN public.conceptos_factura c ON c.id = (l->>'id')::uuid
      WHERE c.organization_id <> v_factura.organization_id OR c.moneda <> v_factura.moneda
        OR c.tasa_ret_isr IS DISTINCT FROM (l->>'tasa_ret_isr')::numeric
        OR c.monto_ret_isr IS DISTINCT FROM (l->>'monto_ret_isr')::numeric
        OR ((c.origen_fiscal->'evaluacion') - ARRAY['emisor','receptor'])
           IS DISTINCT FROM ((l->'evaluacion_fiscal') - ARRAY['emisor','receptor'])
    ) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_totales FROM public._totales_factura_resico_agrupados(p_factura_id);
  IF (v_factura.subtotal, v_factura.iva, v_factura.ret_isr, v_factura.ret_iva, v_factura.total)
    IS DISTINCT FROM ((v_bloque->>'subtotal')::numeric, (v_bloque->>'iva')::numeric,
      (v_bloque->>'ret_isr')::numeric, (v_bloque->>'ret_iva')::numeric, (v_bloque->>'total')::numeric)
    OR (v_totales.subtotal, v_totales.iva, v_totales.ret_isr, v_totales.ret_iva)
      IS DISTINCT FROM (v_factura.subtotal, v_factura.iva, v_factura.ret_isr, v_factura.ret_iva) THEN
    RAISE EXCEPTION 'LC_ISR_FACTURA_REVISION' USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object('factura_id', p_factura_id, 'organization_id', v_factura.organization_id,
    'ambiente', v_cred.ambiente, 'credenciales_actualizadas_at', v_cred.updated_at,
    'perfil_id', v_perfil.id, 'perfil_version', v_perfil.version,
    'conceptos_fingerprint', v_documento->'conceptos_fingerprint', 'totales', v_bloque,
    'emisor', jsonb_build_object('facturapi_org_id', v_perfil.facturapi_org_id,
      'rfc', v_perfil.rfc, 'regimen_fiscal', v_perfil.regimen_fiscal, 'codigo_postal', v_perfil.codigo_postal),
    'receptor', jsonb_build_object('rfc', upper(btrim(v_cliente.rfc)), 'regimen_fiscal', v_cliente.regimen_fiscal));
END;
$$;

CREATE OR REPLACE FUNCTION public.prevalidar_emision_isr_factura(p_factura_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_org uuid := public.org_scope();
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR v_org IS NULL
    OR NOT public.has_any_role_efectivo(v_uid, ARRAY['admin','admin_org','contador','super_admin']::public.app_role[])
    OR NOT EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = p_factura_id
      AND f.organization_id = v_org AND f.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  RETURN public._isr_revisar_factura_emision(p_factura_id);
END;
$$;
REVOKE ALL ON FUNCTION public.prevalidar_emision_isr_factura(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.prevalidar_emision_isr_factura(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public._isr_revisar_factura_emision(uuid) FROM PUBLIC, anon, authenticated, service_role;

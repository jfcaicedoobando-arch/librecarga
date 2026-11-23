-- Consolidate fiscal proformas with immutable native amounts and source traceability.
ALTER TABLE public.proformas ADD COLUMN ajuste_consolidacion_aprobado_at timestamptz,
  ADD COLUMN ajuste_consolidacion_aprobado_por uuid REFERENCES auth.users(id);
ALTER TABLE public.proformas ADD CONSTRAINT proformas_ajuste_consolidacion_chk CHECK (
  (ajuste_consolidacion_aprobado_at IS NULL AND ajuste_consolidacion_aprobado_por IS NULL)
  OR (es_consolidada AND evaluacion_fiscal IS NOT NULL AND ajuste_consolidacion_aprobado_at IS NOT NULL
    AND ajuste_consolidacion_aprobado_por IS NOT NULL));
ALTER TABLE public.proforma_conceptos_consolidados ADD COLUMN linaje_fiscal jsonb;
ALTER TABLE public.proforma_conceptos_consolidados ADD CONSTRAINT pcc_linaje_fiscal_chk CHECK (
  linaje_fiscal IS NULL OR (evaluacion_fiscal IS NOT NULL AND jsonb_typeof(linaje_fiscal) = 'array'
    AND jsonb_array_length(linaje_fiscal) > 0));

-- Called by the writer after ordering and locking the source proformas.
CREATE OR REPLACE FUNCTION public._isr_armar_consolidacion_proformas(p_proforma_ids uuid[], p_org uuid,
  p_embarque_id uuid, p_cliente_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_primera jsonb;
  v_conceptos jsonb;
  v_vigente jsonb;
  v_calculo jsonb;
  v_ajustes jsonb;
  v_tipo_cambio numeric;
BEGIN
  SELECT p.evaluacion_fiscal INTO v_primera FROM public.proformas p
  WHERE p.id = ANY(p_proforma_ids) AND p.organization_id = p_org ORDER BY p.id LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM public.embarques e WHERE e.id = p_embarque_id AND e.organization_id = p_org
    AND e.cliente_id = p_cliente_id AND e.deleted_at IS NULL) OR EXISTS (
    SELECT 1 FROM public.proformas p WHERE p.id = ANY(p_proforma_ids) AND (
      p.organization_id IS DISTINCT FROM p_org OR p.embarque_id IS DISTINCT FROM p_embarque_id
      OR p.cliente_id IS DISTINCT FROM p_cliente_id OR p.es_consolidada OR p.consolidada_en IS NOT NULL
      OR p.deleted_at IS NOT NULL OR p.estado_proforma NOT IN ('pendiente','aprobada')
      OR p.estado_revision = 'consolidada' OR p.estado_cliente = 'rechazada'
      OR p.factura_id IS NOT NULL OR p.factura_secundaria_id IS NOT NULL OR p.folio_factura_externa IS NOT NULL
      OR EXISTS (SELECT 1 FROM public.facturas f WHERE f.proforma_id = p.id AND f.deleted_at IS NULL)
      OR p.evaluacion_fiscal->>'estado' IS DISTINCT FROM 'confirmado'
      OR (p.evaluacion_fiscal->>'ambiente', p.evaluacion_fiscal->>'perfil_id', p.evaluacion_fiscal->>'perfil_version',
          p.evaluacion_fiscal->>'regla_version', p.evaluacion_fiscal->>'precision_version') IS DISTINCT FROM
        (v_primera->>'ambiente', v_primera->>'perfil_id', v_primera->>'perfil_version',
          v_primera->>'regla_version', v_primera->>'precision_version')
    )
  ) THEN RAISE EXCEPTION 'LC_ISR_CONSOLIDACION_INCOMPATIBLE' USING ERRCODE = '23514'; END IF;

  PERFORM 1 FROM public.conceptos_venta c WHERE c.proforma_id = ANY(p_proforma_ids)
    AND c.organization_id = p_org AND c.deleted_at IS NULL ORDER BY c.id FOR UPDATE;
  SELECT jsonb_agg(l || jsonb_build_object('proforma_origen_id', p.id) ORDER BY p.id, l->>'id') INTO v_conceptos
  FROM public.proformas p CROSS JOIN LATERAL jsonb_array_elements(p.conceptos_fiscales) l
  WHERE p.id = ANY(p_proforma_ids) AND p.organization_id = p_org;
  IF v_conceptos IS NULL OR jsonb_array_length(v_conceptos) <> (
    SELECT count(*) FROM public.conceptos_venta c WHERE c.proforma_id = ANY(p_proforma_ids)
      AND c.organization_id = p_org AND c.deleted_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_conceptos) l LEFT JOIN public.conceptos_venta c ON c.id = (l->>'id')::uuid
    WHERE c.id IS NULL OR c.organization_id IS DISTINCT FROM p_org OR c.embarque_id IS DISTINCT FROM p_embarque_id
      OR c.proforma_id IS DISTINCT FROM (l->>'proforma_origen_id')::uuid OR c.deleted_at IS NOT NULL
      OR c.estado_facturacion IS DISTINCT FROM 'en_proforma'
      OR NOT (l @> public._isr_concepto_proforma_normal(to_jsonb(c)))
  ) THEN RAISE EXCEPTION 'LC_ISR_CONSOLIDACION_INCOMPATIBLE' USING ERRCODE = '23514'; END IF;

  v_vigente := public._evaluar_documento_isr_resico(p_org, p_cliente_id, v_conceptos);
  IF v_vigente#>>'{snapshot,estado}' IS DISTINCT FROM 'confirmado' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_vigente->'conceptos') l
    JOIN public.conceptos_venta c ON c.id = (l->>'id')::uuid
    WHERE c.evaluacion_fiscal IS DISTINCT FROM l->'evaluacion_fiscal'
  ) THEN RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514'; END IF;

  SELECT min((p.evaluacion_fiscal->>'tipo_cambio_usd')::numeric) INTO v_tipo_cambio FROM public.proformas p
    WHERE p.id = ANY(p_proforma_ids) AND p.organization_id = p_org;
  IF EXISTS (SELECT 1 FROM public.proformas p WHERE p.id = ANY(p_proforma_ids) AND p.organization_id = p_org
    AND p.subtotal_usd > 0 AND ((p.evaluacion_fiscal->>'tipo_cambio_usd')::numeric IS DISTINCT FROM v_tipo_cambio
      OR COALESCE(v_tipo_cambio,0) <= 0)) THEN
    RAISE EXCEPTION 'LC_ISR_CONSOLIDACION_INCOMPATIBLE' USING ERRCODE = '23514';
  END IF;

  v_calculo := public._isr_snapshot_documento(p_org, p_cliente_id, v_primera->>'ambiente', v_conceptos);
  WITH previas AS (
    SELECT b->>'moneda' moneda, sum((b->>'total')::numeric) total
    FROM public.proformas p CROSS JOIN LATERAL jsonb_array_elements(p.evaluacion_fiscal->'bloques') b
    WHERE p.id = ANY(p_proforma_ids) AND p.organization_id = p_org GROUP BY b->>'moneda'
  ) SELECT jsonb_agg(jsonb_build_object('moneda', previas.moneda, 'anterior', previas.total,
    'nuevo', (b->>'total')::numeric, 'diferencia', (b->>'total')::numeric - previas.total) ORDER BY previas.moneda)
    INTO v_ajustes FROM jsonb_array_elements(v_calculo->'bloques') b JOIN previas ON previas.moneda = b->>'moneda';
  RETURN jsonb_build_object('evaluacion', v_calculo || jsonb_build_object('tipo_cambio_usd', v_tipo_cambio,
    'ajustes_consolidacion', v_ajustes), 'conceptos', v_conceptos);
END;
$$;

CREATE OR REPLACE FUNCTION public._isr_guard_concepto_consolidado() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.linaje_fiscal IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.linaje_fiscal IS NOT NULL OR EXISTS (SELECT 1 FROM public.proformas p
    WHERE p.id = NEW.proforma_id AND p.evaluacion_fiscal IS NOT NULL) THEN
    IF TG_OP <> 'INSERT' OR NEW.linaje_fiscal IS NULL OR NEW.evaluacion_fiscal IS NULL
      OR current_user IS DISTINCT FROM pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = TG_RELID))
      OR NOT EXISTS (SELECT 1 FROM public.proformas p WHERE p.id = NEW.proforma_id AND p.es_consolidada
        AND p.evaluacion_fiscal IS NOT NULL AND p.organization_id = NEW.organization_id
        AND p.embarque_id = NEW.embarque_id AND p.estado_proforma = 'pendiente' AND p.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._isr_insertar_grupos_consolidacion(p_proforma_id uuid, p_org uuid,
  p_embarque_id uuid, p_conceptos jsonb)
RETURNS void LANGUAGE sql SET search_path = pg_catalog, public, pg_temp AS $$
  WITH filas AS (
    SELECT l, l->>'descripcion' descripcion, l->>'moneda' moneda, l->>'tipo_iva' tipo_iva,
      (l->>'aplica_iva')::boolean aplica_iva, (l->>'tasa_iva_aplicada')::numeric tasa_iva,
      (l->>'tasa_ret_isr')::numeric tasa_ret_isr, (l->>'cantidad')::numeric cantidad,
      (l->>'precio_unitario')::numeric precio, l->>'contenedor_id' contenedor_id,
      COALESCE(NULLIF(l#>>'{embarque_contenedores,numero_contenedor}', ''), 'Sin contenedor') contenedor,
      NULLIF(l#>>'{embarque_contenedores,tipo_contenedor}', '') tipo_contenedor
    FROM jsonb_array_elements(p_conceptos) l
  ), grupos AS (
    SELECT descripcion, moneda, tipo_iva, aplica_iva, tasa_iva, tasa_ret_isr, precio, contenedor, tipo_contenedor,
      sum(cantidad) cantidad, sum(cantidad*precio) base_exacta,
      (jsonb_agg(l->'evaluacion_fiscal' ORDER BY l->>'id')->0) evaluacion,
      jsonb_agg(jsonb_build_object('proforma_id', l->'proforma_origen_id', 'concepto_venta_id', l->'id') ORDER BY l->>'id') linaje
    FROM filas GROUP BY descripcion, moneda, tipo_iva, aplica_iva, tasa_iva, tasa_ret_isr, precio,
      contenedor_id, contenedor, tipo_contenedor
  )
  INSERT INTO public.proforma_conceptos_consolidados (proforma_id, embarque_id, organization_id,
    contenedor, tipo_contenedor, descripcion, cantidad, precio_unitario, total, moneda, aplica_iva, iva,
    tasa_iva_aplicada, tipo_iva, tasa_ret_isr, monto_ret_isr, evaluacion_fiscal, linaje_fiscal)
  SELECT p_proforma_id, p_embarque_id, p_org, contenedor, tipo_contenedor, descripcion, cantidad, precio,
    round(base_exacta,2), moneda::public.moneda, aplica_iva, round(base_exacta*tasa_iva,2),
    CASE WHEN tipo_iva='no_objeto' THEN NULL ELSE tasa_iva END, tipo_iva, tasa_ret_isr, round(base_exacta*tasa_ret_isr,2),
    evaluacion || jsonb_build_object('base', round(base_exacta,2), 'base_exacta', base_exacta,
      'monto_ret_isr', round(base_exacta*tasa_ret_isr,2)), linaje
  FROM grupos;
$$;

CREATE OR REPLACE FUNCTION public._isr_consolidar_proformas(p_org uuid, p_embarque_id uuid, p_cliente_id uuid, p_ids uuid[])
RETURNS uuid LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_plan jsonb;
  v_fiscal jsonb;
  v_usd jsonb;
  v_mxn jsonb;
  v_tipo_cambio numeric;
  v_nueva_id uuid;
  v_origen public.proformas;
  v_total_mxn numeric;
  v_requiere boolean;
  v_actualizados integer;
BEGIN
  IF p_org IS DISTINCT FROM public.org_scope() THEN RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE='42501'; END IF;
  v_plan := public._isr_armar_consolidacion_proformas(p_ids, p_org, p_embarque_id, p_cliente_id);
  v_fiscal := v_plan->'evaluacion';
  SELECT * INTO v_origen FROM public.proformas WHERE id = ANY(p_ids) AND organization_id = p_org ORDER BY id LIMIT 1;
  IF EXISTS (SELECT 1 FROM public.proformas p WHERE p.id = ANY(p_ids) AND p.organization_id = p_org
    AND p.dias_credito IS DISTINCT FROM v_origen.dias_credito) THEN
    RAISE EXCEPTION 'LC_ISR_CONSOLIDACION_INCOMPATIBLE' USING ERRCODE = '23514';
  END IF;
  SELECT b INTO v_usd FROM jsonb_array_elements(v_fiscal->'bloques') b WHERE b->>'moneda' = 'USD';
  SELECT b INTO v_mxn FROM jsonb_array_elements(v_fiscal->'bloques') b WHERE b->>'moneda' = 'MXN';
  v_tipo_cambio := COALESCE((v_fiscal->>'tipo_cambio_usd')::numeric,0);
  v_total_mxn := COALESCE((v_mxn->>'total')::numeric,0) + round(COALESCE((v_usd->>'total')::numeric,0)*v_tipo_cambio,2);
  IF v_tipo_cambio > 0 THEN v_fiscal := v_fiscal || jsonb_build_object('total_equivalente_mxn', v_total_mxn); END IF;
  v_requiere := EXISTS (SELECT 1 FROM jsonb_array_elements(v_fiscal->'ajustes_consolidacion') a
    WHERE (a->>'diferencia')::numeric <> 0);

  INSERT INTO public.proformas (numero,embarque_id,cliente_id,cliente_nombre,expediente,bl_master,
    organization_id,operador,dias_credito,tasa_iva_aplicada,fecha_emision,notas,es_consolidada,proformas_origen,
    subtotal_usd,iva_usd,total_usd,subtotal_mxn,iva_mxn,total_mxn,estado_revision,evaluacion_fiscal,conceptos_fiscales)
  VALUES (public.generar_numero_proforma(p_org),p_embarque_id,p_cliente_id,v_origen.cliente_nombre,v_origen.expediente,
    v_origen.bl_master,p_org,v_origen.operador,v_origen.dias_credito,v_origen.tasa_iva_aplicada,public.fecha_negocio_mx(),
    'Consolidación de ' || cardinality(p_ids) || ' proformas',true,p_ids,
    COALESCE((v_usd->>'subtotal')::numeric,0),COALESCE((v_usd->>'iva')::numeric,0),COALESCE((v_usd->>'total')::numeric,0),
    COALESCE((v_mxn->>'subtotal')::numeric,0) + round(COALESCE((v_usd->>'subtotal')::numeric,0)*v_tipo_cambio,2),
    COALESCE((v_mxn->>'iva')::numeric,0) + round(COALESCE((v_usd->>'iva')::numeric,0)*v_tipo_cambio,2),v_total_mxn,
    CASE WHEN v_requiere THEN 'pendiente' ELSE 'aprobada' END,v_fiscal,v_plan->'conceptos') RETURNING id INTO v_nueva_id;

  PERFORM public._isr_insertar_grupos_consolidacion(v_nueva_id, p_org, p_embarque_id, v_plan->'conceptos');
  UPDATE public.proformas SET estado_revision = 'consolidada', consolidada_en = v_nueva_id,
    token_publico = NULL, token_expira_at = NULL
  WHERE id = ANY(p_ids) AND organization_id = p_org;
  UPDATE public.conceptos_venta SET proforma_id = v_nueva_id
  WHERE proforma_id = ANY(p_ids) AND organization_id = p_org AND embarque_id = p_embarque_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_actualizados = ROW_COUNT;
  IF v_actualizados <> jsonb_array_length(v_plan->'conceptos') THEN
    RAISE EXCEPTION 'LC_ISR_CONSOLIDACION_INCOMPATIBLE' USING ERRCODE = '23514';
  END IF;
  RETURN v_nueva_id;
END;
$$;

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
  IF NEW.estado_proforma = 'facturada' OR NEW.factura_id IS NOT NULL OR NEW.factura_secundaria_id IS NOT NULL
    OR NEW.folio_factura_externa IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE = '23514';
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
  IF (v_anterior IS NULL OR v_anterior = v_nuevo) AND v_nuevo IS NOT NULL
    AND (v_anterior IS NOT NULL OR NOT v_proforma.es_consolidada)
    AND p_nuevo->>'estado_facturacion' = 'en_proforma' AND v_proforma.deleted_at IS NULL
    AND v_proforma.estado_proforma IN ('pendiente', 'aprobada') AND v_proforma.estado_cliente <> 'rechazada' THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE = '23514';
END;
$$;

CREATE OR REPLACE FUNCTION public.aprobar_ajuste_consolidacion_proforma(p_proforma_id uuid, p_huella text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_proforma public.proformas;
  v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_proforma FROM public.proformas WHERE id = p_proforma_id AND organization_id = public.org_scope() FOR UPDATE;
  IF NOT FOUND OR NOT public.has_any_role_in_org_exact(v_uid, ARRAY['admin','admin_org','contador']::public.app_role[], v_proforma.organization_id) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF NOT v_proforma.es_consolidada OR v_proforma.evaluacion_fiscal IS NULL OR v_proforma.deleted_at IS NOT NULL
    OR v_proforma.estado_proforma <> 'pendiente' OR v_proforma.estado_cliente = 'rechazada'
    OR v_proforma.evaluacion_fiscal->>'conceptos_fingerprint' IS DISTINCT FROM p_huella
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_proforma.evaluacion_fiscal->'ajustes_consolidacion') a
      WHERE (a->>'diferencia')::numeric <> 0) THEN
    RAISE EXCEPTION 'LC_ISR_CONSOLIDACION_APROBACION' USING ERRCODE = '23514';
  END IF;
  IF v_proforma.ajuste_consolidacion_aprobado_at IS NULL THEN
    UPDATE public.proformas SET estado_revision = 'aprobada', ajuste_consolidacion_aprobado_at = clock_timestamp(),
      ajuste_consolidacion_aprobado_por = v_uid WHERE id = p_proforma_id RETURNING * INTO v_proforma;
  END IF;
  RETURN jsonb_build_object('proforma_id', p_proforma_id, 'aprobada_at', v_proforma.ajuste_consolidacion_aprobado_at);
END;
$$;

CREATE OR REPLACE FUNCTION public._isr_guard_concepto() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_cliente uuid; v_eval jsonb; v_parent_org uuid; v_opt_in boolean; v_ambiente text; v_origen jsonb; v_cot public.cotizaciones;
  v_revision boolean := false;
  v_linea jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.evaluacion_fiscal IS NOT NULL THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL AND NEW.evaluacion_fiscal IS NULL THEN
    RAISE EXCEPTION 'LC_ISR_NO_DESACTIVAR' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'conceptos_venta' AND TG_OP = 'UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL
    AND (OLD.proforma_id IS NOT NULL OR NEW.proforma_id IS NOT NULL) THEN
    PERFORM public._isr_validar_vinculo_proforma_normal(to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'proforma_conceptos_consolidados' AND TG_OP = 'INSERT' AND to_jsonb(NEW)->>'linaje_fiscal' IS NOT NULL THEN
    -- The invoker guard authenticates the creator and protects these frozen groups.
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'conceptos_venta' THEN
    -- An authenticated writer cannot create an open audit row or reuse a completed review.
    SELECT EXISTS (SELECT 1 FROM public.embarque_revisiones_fiscales r
      WHERE r.embarque_id = NEW.embarque_id AND r.organization_id = NEW.organization_id
        AND r.transaccion = txid_current() AND r.actor_id = auth.uid() AND r.aplicada_at IS NULL)
      INTO v_revision;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL AND (
    (to_jsonb(NEW)->'organization_id',to_jsonb(NEW)->'embarque_id',to_jsonb(NEW)->'proforma_id')
      IS DISTINCT FROM
    (to_jsonb(OLD)->'organization_id',to_jsonb(OLD)->'embarque_id',to_jsonb(OLD)->'proforma_id')
    OR (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      AND NOT (v_revision AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='conceptos_venta' THEN
    IF TG_OP='UPDATE' AND OLD.cotizacion_concepto_origen_id IS DISTINCT FROM NEW.cotizacion_concepto_origen_id THEN
      RAISE EXCEPTION 'LC_ISR_LINAJE_INVALIDO' USING ERRCODE='23514';
    END IF;
    v_opt_in := public._isr_documento_habilitado(NEW.organization_id) OR EXISTS(
      SELECT 1 FROM public.conceptos_venta WHERE embarque_id=NEW.embarque_id AND evaluacion_fiscal IS NOT NULL
    );
    IF TG_OP='UPDATE' AND OLD.embarque_id IS DISTINCT FROM NEW.embarque_id
      AND (v_opt_in OR NEW.evaluacion_fiscal IS NOT NULL) THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
    END IF;
    IF NEW.evaluacion_fiscal IS NULL AND NEW.proforma_id IS NULL AND NEW.estado_facturacion='pendiente'
      AND v_opt_in THEN
      NEW.evaluacion_fiscal:='{}';
    END IF;
  END IF;
  IF NEW.evaluacion_fiscal IS NULL THEN
    IF NEW.tasa_ret_isr IS NOT NULL OR NEW.monto_ret_isr IS NOT NULL THEN
      RAISE EXCEPTION 'LC_ISR_EVALUACION_REQUERIDA' USING ERRCODE = '23514';
    END IF;
    v_opt_in := (
      (TG_TABLE_NAME='conceptos_venta' AND EXISTS(SELECT 1 FROM public.conceptos_venta
        WHERE embarque_id=(to_jsonb(NEW)->>'embarque_id')::uuid AND evaluacion_fiscal IS NOT NULL))
      OR (TG_TABLE_NAME='proforma_conceptos_consolidados' AND EXISTS(SELECT 1 FROM public.proforma_conceptos_consolidados
        WHERE proforma_id=(to_jsonb(NEW)->>'proforma_id')::uuid AND evaluacion_fiscal IS NOT NULL))
    );
    -- Serialize opt-in against legacy conversion, not ordinary legacy edits.
    IF TG_TABLE_NAME='conceptos_venta' AND NEW.proforma_id IS NOT NULL THEN
      PERFORM 1 FROM public.embarques WHERE id=NEW.embarque_id FOR NO KEY UPDATE;
      SELECT EXISTS(SELECT 1 FROM public.conceptos_venta WHERE embarque_id=NEW.embarque_id
        AND evaluacion_fiscal IS NOT NULL) INTO v_opt_in;
      IF v_opt_in THEN RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514'; END IF;
    END IF;
    IF v_opt_in AND (TG_OP='INSERT' OR (TG_OP='UPDATE' AND
      (to_jsonb(NEW)->'embarque_id',to_jsonb(NEW)->'proforma_id',NEW.organization_id) IS DISTINCT FROM
      (to_jsonb(OLD)->'embarque_id',to_jsonb(OLD)->'proforma_id',OLD.organization_id))) THEN
      RAISE EXCEPTION 'LC_ISR_EVALUACION_REQUERIDA' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'conceptos_venta' THEN
    SELECT cliente_id,organization_id INTO v_cliente,v_parent_org FROM public.embarques WHERE id=NEW.embarque_id FOR NO KEY UPDATE;
    IF EXISTS(SELECT 1 FROM public.conceptos_venta c JOIN public.proformas pf ON pf.id = c.proforma_id
      WHERE c.embarque_id = NEW.embarque_id AND pf.evaluacion_fiscal IS NULL) THEN
      RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514';
    END IF;
    IF NEW.proforma_id IS NOT NULL OR NEW.estado_facturacion <> 'pendiente' THEN
      RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT cliente_id,organization_id INTO v_cliente,v_parent_org FROM public.proformas
      WHERE id=NEW.proforma_id AND estado_aprobacion='borrador' AND estado_proforma='pendiente'
      AND evaluacion_fiscal IS NULL
      AND enviada_at IS NULL AND factura_id IS NULL AND factura_secundaria_id IS NULL
      AND estado_cliente='pendiente' AND consolidada_en IS NULL FOR NO KEY UPDATE;
    IF EXISTS(SELECT 1 FROM public.conceptos_factura WHERE proforma_id_origen=NEW.proforma_id) THEN
      RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514';
    END IF;
  END IF;
  IF v_parent_org IS DISTINCT FROM NEW.organization_id OR v_parent_org IS NULL THEN
    RAISE EXCEPTION 'LC_ISR_PADRE_INVALIDO' USING ERRCODE = '23514';
  END IF;
  IF v_revision AND NEW.deleted_at IS NULL THEN
    v_linea := public._evaluar_documento_isr_resico(NEW.organization_id, v_cliente, jsonb_build_array(to_jsonb(NEW)))
      ->'conceptos'->0;
    NEW.tipo_iva := v_linea->>'tipo_iva';
    NEW.total := round(NEW.cantidad * NEW.precio_unitario, 2);
    NEW.evaluacion_fiscal := v_linea->'evaluacion_fiscal';
    NEW.tasa_ret_isr := (v_linea->>'tasa_ret_isr')::numeric;
    NEW.monto_ret_isr := (v_linea->>'monto_ret_isr')::numeric;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME='conceptos_venta' AND TG_OP='UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL THEN
    IF public._isr_base_revision_venta(to_jsonb(NEW)) IS DISTINCT FROM public._isr_base_revision_venta(to_jsonb(OLD))
      OR NEW.total IS DISTINCT FROM OLD.total THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE = '23514';
    END IF;
    NEW.evaluacion_fiscal := OLD.evaluacion_fiscal;
    NEW.tasa_ret_isr := OLD.tasa_ret_isr;
    NEW.monto_ret_isr := OLD.monto_ret_isr;
    RETURN NEW;
  END IF;
  SELECT ambiente INTO v_ambiente FROM public.facturapi_credenciales WHERE organization_id=NEW.organization_id;
  IF TG_TABLE_NAME='conceptos_venta' AND TG_OP='INSERT' AND to_jsonb(NEW)->>'cotizacion_concepto_origen_id' IS NOT NULL THEN
    SELECT c.* INTO v_cot FROM public.cotizaciones c JOIN public.embarques e ON e.cotizacion_id=c.id
      WHERE e.id=NEW.embarque_id AND c.organization_id=NEW.organization_id AND c.deleted_at IS NULL;
    SELECT l INTO v_origen FROM jsonb_array_elements(v_cot.conceptos_venta) l WHERE l->>'id'=NEW.cotizacion_concepto_origen_id;
    IF v_cot.evaluacion_fiscal->>'estado' IS DISTINCT FROM 'confirmado' OR v_cot.estado::text NOT IN ('Aceptada','En operación')
      OR v_origen IS NULL OR NEW.origen<>'cotizacion'
      OR (NEW.cantidad,NEW.precio_unitario,NEW.moneda::text,NEW.tipo_iva,NEW.tasa_iva_aplicada)
        IS DISTINCT FROM ((v_origen->>'cantidad')::numeric,(v_origen->>'precio_unitario')::numeric,v_origen->>'moneda',
          v_origen->>'tipo_iva',COALESCE((v_origen->>'tasa_iva_aplicada')::numeric,CASE v_origen->>'tipo_iva' WHEN 'gravado_16' THEN .16 WHEN 'gravado_8' THEN .08 ELSE 0 END)) THEN
      RAISE EXCEPTION 'LC_ISR_LINAJE_INVALIDO' USING ERRCODE='23514';
    END IF;
    v_eval:=public._evaluar_isr_resico(NEW.organization_id,v_cliente,COALESCE(v_ambiente,'sandbox'),NEW.cantidad,NEW.precio_unitario,NEW.tipo_iva);
    IF v_eval IS DISTINCT FROM v_origen->'evaluacion_fiscal' THEN RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514'; END IF;
    v_eval:=v_origen->'evaluacion_fiscal';
  ELSE
    v_eval := public._evaluar_isr_resico(NEW.organization_id,v_cliente,COALESCE(v_ambiente,'sandbox'),
      NEW.cantidad,NEW.precio_unitario,NEW.tipo_iva);
  END IF;
  NEW.evaluacion_fiscal := v_eval;
  NEW.tasa_ret_isr := (v_eval->>'tasa_ret_isr')::numeric;
  NEW.monto_ret_isr := (v_eval->>'monto_ret_isr')::numeric;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._isr_guard_padre() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME='embarques' THEN
    IF (NEW.cliente_id,NEW.organization_id) IS DISTINCT FROM (OLD.cliente_id,OLD.organization_id)
      AND EXISTS (SELECT 1 FROM public.conceptos_venta WHERE embarque_id=OLD.id AND evaluacion_fiscal IS NOT NULL)
      AND (NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NOT EXISTS (
        SELECT 1 FROM public.embarque_revisiones_fiscales r
        WHERE r.embarque_id = OLD.id AND r.organization_id = OLD.organization_id
          AND r.transaccion = txid_current() AND r.actor_id = auth.uid() AND r.aplicada_at IS NULL
          AND (r.snapshot_anterior->>'cliente_id')::uuid IS NOT DISTINCT FROM OLD.cliente_id
          AND (r.snapshot_nuevo->>'cliente_id')::uuid IS NOT DISTINCT FROM NEW.cliente_id
      )) THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
    END IF;
  ELSE
    IF OLD.evaluacion_fiscal IS NULL AND EXISTS (SELECT 1 FROM public.proforma_conceptos_consolidados WHERE proforma_id=OLD.id AND evaluacion_fiscal IS NOT NULL)
      AND ((NEW.cliente_id,NEW.organization_id) IS DISTINCT FROM (OLD.cliente_id,OLD.organization_id)
        OR NEW.estado_aprobacion <> 'borrador' OR NEW.estado_proforma <> 'pendiente'
        OR NEW.enviada_at IS NOT NULL OR NEW.factura_id IS NOT NULL OR NEW.factura_secundaria_id IS NOT NULL
        OR NEW.consolidada_en IS NOT NULL OR NEW.estado_cliente <> 'pendiente') THEN
      RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Fuente canónica. Forward: 20261006233000_proforma_operativa_compatibilidad.sql.
CREATE OR REPLACE FUNCTION public.consolidar_proformas(p_embarque_id uuid, p_cliente_id uuid, p_cliente_nombre text, p_expediente text, p_bl_master text, p_operador text, p_dias_credito integer, p_organization_id uuid, p_proforma_ids uuid[], p_tasa_iva numeric DEFAULT 0.16, p_request_id uuid DEFAULT NULL::uuid) RETURNS public.proformas
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_bypass_prev text;
  v_nueva          public.proformas;
  v_cached         jsonb;
  v_caller_org     uuid;
  v_org_efectiva   uuid;
  v_count          int;
  v_numero         text;
  v_subtotal_usd   numeric := 0;
  v_iva_usd        numeric := 0;
  v_total_usd      numeric := 0;
  v_subtotal_mxn   numeric := 0;
  v_iva_mxn        numeric := 0;
  v_total_mxn      numeric := 0;
  v_no_soportados  int;
  v_fiscal_id      uuid;
BEGIN
  v_caller_org := public.current_user_org_id();
  IF public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    v_org_efectiva := p_organization_id;
  ELSE
    v_org_efectiva := v_caller_org;
  END IF;
  PERFORM public._assert_writer(v_org_efectiva);
  IF p_proforma_ids IS NULL OR array_length(p_proforma_ids, 1) IS NULL OR array_length(p_proforma_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Selecciona al menos 2 proformas para consolidar';
  END IF;
  v_cached := public.idempotency_claim(p_request_id, 'consolidar_proformas');
  IF v_cached IS NOT NULL THEN
    SELECT * INTO v_nueva FROM public.proformas WHERE id = (v_cached->>'id')::uuid AND organization_id = v_org_efectiva;
    IF v_nueva.id IS NULL OR v_nueva.embarque_id IS DISTINCT FROM p_embarque_id OR v_nueva.cliente_id IS DISTINCT FROM p_cliente_id
      OR (v_nueva.proformas_origen @> p_proforma_ids AND p_proforma_ids @> v_nueva.proformas_origen) IS DISTINCT FROM true
      OR (v_nueva.evaluacion_fiscal IS NOT NULL AND v_org_efectiva IS DISTINCT FROM public.org_scope()) THEN
      RAISE EXCEPTION 'LC_ISR_CONSOLIDACION_INCOMPATIBLE' USING ERRCODE = '23514';
    END IF;
    RETURN v_nueva;
  END IF;
  PERFORM 1 FROM public.proformas
  WHERE id = ANY(p_proforma_ids) AND organization_id = v_org_efectiva ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_count
  FROM public.proformas
  WHERE id = ANY(p_proforma_ids) AND organization_id = v_org_efectiva;
  IF v_count <> array_length(p_proforma_ids, 1) THEN
    RAISE EXCEPTION 'Una o más proformas no existen o no pertenecen a la organización';
  END IF;
  IF EXISTS (SELECT 1 FROM public.proformas WHERE id = ANY(p_proforma_ids) AND estado_proforma = 'cancelada') THEN
    RAISE EXCEPTION 'LC_PROFORMA_CANCELADA: no se puede consolidar una proforma cancelada' USING ERRCODE='P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.proformas WHERE id = ANY(p_proforma_ids) AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'LC_PROFORMA_ELIMINADA: no se puede consolidar una proforma eliminada' USING ERRCODE='P0001';
  END IF;
  -- Ola 3: la consolidación no puede cruzar embarques.
  IF EXISTS (
    SELECT 1 FROM public.proformas
    WHERE id = ANY(p_proforma_ids)
      AND embarque_id IS DISTINCT FROM p_embarque_id
  ) THEN
    RAISE EXCEPTION
      'LC_PROFORMA_EMBARQUE_AJENO: todas las proformas a consolidar deben pertenecer al mismo embarque'
      USING ERRCODE = 'P0001';
  END IF;
  -- Ola 2 · A: guard equivalente al de crear_proforma_atomica sobre los
  -- conceptos subyacentes (una moneda no soportada consolidaba en $0).
  SELECT COUNT(*) INTO v_no_soportados
  FROM public.conceptos_venta cv
  WHERE cv.proforma_id = ANY(p_proforma_ids)
    AND cv.organization_id = v_org_efectiva
    AND cv.deleted_at IS NULL
    AND cv.moneda NOT IN ('MXN', 'USD');
  IF v_no_soportados > 0 THEN
    RAISE EXCEPTION 'LC_MONEDA_VENTA_NO_SOPORTADA: % concepto(s) de venta tienen una moneda no soportada; sólo se puede facturar en MXN o USD', v_no_soportados
      USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.proformas p WHERE p.id = ANY(p_proforma_ids) AND p.organization_id = v_org_efectiva
    AND p.evaluacion_fiscal IS NOT NULL) THEN
    v_fiscal_id := public._isr_consolidar_proformas(v_org_efectiva, p_embarque_id, p_cliente_id, p_proforma_ids);
    SELECT * INTO STRICT v_nueva FROM public.proformas WHERE id = v_fiscal_id;
    PERFORM public.idempotency_store(p_request_id, jsonb_build_object('id', v_fiscal_id));
    RETURN v_nueva;
  END IF;
  v_numero := public.generar_numero_proforma(v_org_efectiva);
  INSERT INTO public.proformas (
    numero, embarque_id, cliente_id, cliente_nombre, expediente, bl_master,
    subtotal_usd, iva_usd, total_usd, subtotal_mxn, iva_mxn, total_mxn,
    notas, operador, dias_credito, organization_id,
    estado_revision, es_consolidada, proformas_origen, tasa_iva_aplicada
  ) VALUES (
    v_numero, p_embarque_id, p_cliente_id, p_cliente_nombre, p_expediente, p_bl_master,
    0, 0, 0, 0, 0, 0,
    'Consolidación de ' || array_length(p_proforma_ids, 1) || ' proformas',
    p_operador, p_dias_credito, v_org_efectiva,
    'aprobada', true, p_proforma_ids, p_tasa_iva
  ) RETURNING * INTO v_nueva;
  -- A-1: cantidad SIN ::int (BL-1 permite decimales); IVA por LÍNEA con la tasa
  -- propia de cada concepto y redondeo por línea (BL-12). La tasa efectiva y el
  -- tratamiento fiscal explícito entran al GROUP BY: 'no_objeto', 'exento' y
  -- 'tasa_0' quedan en líneas distintas aunque su IVA sea 0.
  -- P1 · Auditoría IVA: la tasa es CANÓNICA por tratamiento; una tasa numérica
  -- faltante NUNCA se rellena con la tasa general si el tipo dice otra cosa.
  INSERT INTO public.proforma_conceptos_consolidados (
    proforma_id, embarque_id, contenedor, tipo_contenedor,
    descripcion, cantidad, precio_unitario, total, moneda, aplica_iva, iva,
    organization_id, tasa_iva_aplicada, tipo_iva
  )
  SELECT
    v_nueva.id, cv.embarque_id,
    COALESCE(NULLIF(ec.numero_contenedor, ''), NULLIF(e.contenedor, ''), 'Sin contenedor'),
    COALESCE(NULLIF(ec.tipo_contenedor, ''), NULLIF(e.tipo_contenedor, '')),
    cv.descripcion, SUM(cv.cantidad), cv.precio_unitario,
    ROUND(SUM(cv.cantidad * cv.precio_unitario), 2), cv.moneda,
    CASE WHEN cv.tipo_iva IN ('no_objeto', 'exento') THEN false ELSE cv.aplica_iva END,
    ROUND(SUM(cv.cantidad * cv.precio_unitario) * CASE
            WHEN cv.tipo_iva = 'gravado_16' THEN p_tasa_iva
            WHEN cv.tipo_iva = 'gravado_8'  THEN 0.08
            WHEN cv.tipo_iva IN ('tasa_0', 'exento', 'no_objeto') THEN 0
            ELSE COALESCE(cv.tasa_iva_aplicada, CASE WHEN cv.aplica_iva THEN p_tasa_iva ELSE 0 END)
          END, 2),
    v_org_efectiva,
    CASE WHEN cv.tipo_iva = 'no_objeto' THEN NULL
         ELSE CASE
            WHEN cv.tipo_iva = 'gravado_16' THEN p_tasa_iva
            WHEN cv.tipo_iva = 'gravado_8'  THEN 0.08
            WHEN cv.tipo_iva IN ('tasa_0', 'exento', 'no_objeto') THEN 0
            ELSE COALESCE(cv.tasa_iva_aplicada, CASE WHEN cv.aplica_iva THEN p_tasa_iva ELSE 0 END)
          END
    END,
    cv.tipo_iva
  FROM public.conceptos_venta cv
  LEFT JOIN public.embarques e ON e.id = cv.embarque_id
  LEFT JOIN public.embarque_contenedores ec ON ec.id = cv.contenedor_id
  WHERE cv.proforma_id = ANY(p_proforma_ids)
    AND cv.organization_id = v_org_efectiva
    AND cv.embarque_id = p_embarque_id
    AND cv.deleted_at IS NULL
  GROUP BY cv.embarque_id,
    COALESCE(NULLIF(ec.numero_contenedor, ''), NULLIF(e.contenedor, ''), 'Sin contenedor'),
    COALESCE(NULLIF(ec.tipo_contenedor, ''), NULLIF(e.tipo_contenedor, '')),
    cv.descripcion, cv.precio_unitario, cv.moneda, cv.aplica_iva, cv.tipo_iva,
    CASE
            WHEN cv.tipo_iva = 'gravado_16' THEN p_tasa_iva
            WHEN cv.tipo_iva = 'gravado_8'  THEN 0.08
            WHEN cv.tipo_iva IN ('tasa_0', 'exento', 'no_objeto') THEN 0
            ELSE COALESCE(cv.tasa_iva_aplicada, CASE WHEN cv.aplica_iva THEN p_tasa_iva ELSE 0 END)
          END;
  -- Encabezado = Σ del detalle recién generado.
  SELECT
    COALESCE(SUM(pcc.total) FILTER (WHERE pcc.moneda = 'USD'), 0),
    COALESCE(SUM(pcc.iva)   FILTER (WHERE pcc.moneda = 'USD'), 0),
    COALESCE(SUM(pcc.total) FILTER (WHERE pcc.moneda = 'MXN'), 0),
    COALESCE(SUM(pcc.iva)   FILTER (WHERE pcc.moneda = 'MXN'), 0)
  INTO v_subtotal_usd, v_iva_usd, v_subtotal_mxn, v_iva_mxn
  FROM public.proforma_conceptos_consolidados pcc
  WHERE pcc.proforma_id = v_nueva.id;
  v_total_usd := v_subtotal_usd + v_iva_usd;
  v_total_mxn := v_subtotal_mxn + v_iva_mxn;
  UPDATE public.proformas
  SET subtotal_usd = v_subtotal_usd, iva_usd = v_iva_usd, total_usd = v_total_usd,
      subtotal_mxn = v_subtotal_mxn, iva_mxn = v_iva_mxn, total_mxn = v_total_mxn
  WHERE id = v_nueva.id
  RETURNING * INTO v_nueva;
  UPDATE public.proformas
  SET estado_revision = 'consolidada', consolidada_en = v_nueva.id
  WHERE id = ANY(p_proforma_ids);
  -- v13.301.69 FIX BUG 2: repuntar conceptos_venta a la proforma consolidada
  -- para que sync_conceptos_venta_facturado propague al facturar/cancelar.
  v_bypass_prev := COALESCE(current_setting('app.bypass_cierre', true), '');
  BEGIN
    PERFORM set_config('app.bypass_cierre', 'on', true);
    UPDATE public.conceptos_venta
       SET proforma_id = v_nueva.id
     WHERE proforma_id = ANY(p_proforma_ids)
       AND organization_id = v_org_efectiva
       AND deleted_at IS NULL;
    PERFORM set_config('app.bypass_cierre', v_bypass_prev, true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_cierre', v_bypass_prev, true);
    RAISE;
  END;
  PERFORM public.idempotency_store(p_request_id, jsonb_build_object('id', v_nueva.id));
  RETURN v_nueva;
END;
$_$;

-- Canonical schema para public.portal_obtener_proforma_por_token
-- Sincronizado en FIX4 tanda 4 (N-2 · multimoneda dual).
--
-- Historial de fixes:
--   · antes se exponía una columna inexistente (`importe`) de la vista
--     `proforma_conceptos_consolidados`, que publica `total`. Se conserva el
--     nombre `importe` como clave de salida en el JSON del portal público
--     para no romper el contrato con el front.
--   · FIX3 (drift ronda 2): rate limit de BD restaurado (30 lecturas/min por
--     IP+identidad), mismo patrón que las demás RPCs de la whitelist anon.
--     check_ratelimit escribe en ratelimit_buckets → la función debe ser
--     VOLATILE.
--   · FIX4 N-2: la tabla proformas ya no tiene moneda/subtotal/iva/total
--     singulares (son *_mxn / *_usd). La RPC devuelve ambos juegos duales y
--     conserva las claves legacy singulares derivadas (MXN si
--     subtotal_mxn > 0 o ambos cero; si no, USD) para no romper el contrato
--     del front publicado.
CREATE OR REPLACE FUNCTION public.portal_obtener_proforma_por_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_proforma public.proformas%ROWTYPE;
  v_conceptos jsonb;
  v_estado_link text;
  v_rl jsonb;
  v_moneda_legacy text;
  v_bloques jsonb;
  v_mxn jsonb;
  v_usd jsonb;
BEGIN
  v_rl := public.check_ratelimit(
    'rpc:portal_obtener_proforma_por_token:'
      || COALESCE(NULLIF(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', ''), 'sin-ip')
      || ':' || COALESCE(auth.uid()::text, 'anon'),
    60, 30
  );
  IF (v_rl->>'ok') = 'false' THEN
    RAISE EXCEPTION 'Demasiadas solicitudes. Intenta de nuevo en % segundos.', COALESCE(v_rl->>'retry_after', '60')
      USING ERRCODE = 'P0001';
  END IF;

  IF p_token IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_proforma FROM public.proformas WHERE token_publico = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','token_invalido'); END IF;

  IF v_proforma.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('error','token_invalido');
  END IF;

  IF v_proforma.estado_proforma = 'cancelada' THEN
    v_estado_link := 'cancelada';
  ELSIF v_proforma.token_expira_at IS NOT NULL AND v_proforma.token_expira_at < now() THEN
    v_estado_link := 'expirado';
  ELSIF v_proforma.estado_cliente <> 'pendiente' THEN
    v_estado_link := 'respondida';
  ELSE
    v_estado_link := 'activo';
  END IF;

  -- BL-11: link no vigente → no exponer montos, conceptos ni datos del cliente.
  IF v_estado_link <> 'activo' THEN
    RETURN jsonb_build_object(
      'estado_link', v_estado_link,
      'proforma', jsonb_build_object(
        'id', v_proforma.id,
        'numero', v_proforma.numero
      ),
      'conceptos', '[]'::jsonb
    );
  END IF;

  IF v_proforma.evaluacion_fiscal IS NOT NULL THEN
    -- Proyección pública de los importes y renglones guardados, sin perfil ni linaje interno.
    SELECT jsonb_agg(jsonb_build_object('moneda', b->'moneda', 'subtotal', b->'subtotal', 'iva', b->'iva',
      'ret_isr', b->'ret_isr', 'ret_iva', b->'ret_iva', 'total', b->'total') ORDER BY b->>'moneda')
      INTO v_bloques FROM jsonb_array_elements(v_proforma.evaluacion_fiscal->'bloques') b;
    SELECT b INTO v_mxn FROM jsonb_array_elements(v_bloques) b WHERE b->>'moneda' = 'MXN';
    SELECT b INTO v_usd FROM jsonb_array_elements(v_bloques) b WHERE b->>'moneda' = 'USD';
    IF NOT v_proforma.es_consolidada THEN
      SELECT jsonb_agg(jsonb_build_object('id', c->'id', 'descripcion', c->'descripcion', 'cantidad', c->'cantidad',
      'precio_unitario', c->'precio_unitario', 'importe', c->'total', 'moneda', c->'moneda',
      'tipo_iva', c->'tipo_iva', 'tasa_iva_aplicada', c->'tasa_iva_aplicada', 'aplica_iva', c->'aplica_iva') ORDER BY ord)
      INTO v_conceptos FROM jsonb_array_elements(v_proforma.conceptos_fiscales) WITH ORDINALITY AS l(c, ord);
    END IF;
    v_moneda_legacy := CASE WHEN v_mxn IS NOT NULL THEN 'MXN' ELSE 'USD' END;
  ELSE
    v_moneda_legacy := CASE
      WHEN v_proforma.subtotal_mxn > 0
        OR (v_proforma.subtotal_mxn = 0 AND v_proforma.subtotal_usd = 0)
      THEN 'MXN' ELSE 'USD' END;
    v_mxn := jsonb_build_object('subtotal', v_proforma.subtotal_mxn, 'iva', v_proforma.iva_mxn, 'total', v_proforma.total_mxn);
    v_usd := jsonb_build_object('subtotal', v_proforma.subtotal_usd, 'iva', v_proforma.iva_usd, 'total', v_proforma.total_usd);
  END IF;
  IF v_conceptos IS NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pcc.id,
    'descripcion', pcc.descripcion,
    'cantidad', pcc.cantidad,
    'precio_unitario', pcc.precio_unitario,
    'importe', pcc.total,
    'moneda', pcc.moneda,
    'tipo_iva', pcc.tipo_iva,
    'tasa_iva_aplicada', pcc.tasa_iva_aplicada,
    'aplica_iva', pcc.aplica_iva
  ) ORDER BY pcc.created_at), '[]'::jsonb)
    INTO v_conceptos
    FROM public.proforma_conceptos_consolidados pcc
   WHERE pcc.proforma_id = v_proforma.id AND pcc.deleted_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'estado_link', v_estado_link,
    'proforma', jsonb_build_object(
      'id', v_proforma.id,
      'numero', v_proforma.numero,
      'cliente_nombre', v_proforma.cliente_nombre,
      'expediente', v_proforma.expediente,
      -- Juegos duales (fuente de verdad multimoneda)
      'subtotal_mxn', v_mxn->'subtotal',
      'iva_mxn', v_mxn->'iva',
      'total_mxn', v_mxn->'total',
      'subtotal_usd', v_usd->'subtotal',
      'iva_usd', v_usd->'iva',
      'total_usd', v_usd->'total',
      'totales_fiscales', v_bloques,
      -- Claves legacy singulares derivadas (compat con el front publicado)
      'moneda', v_moneda_legacy,
      'subtotal', CASE WHEN v_moneda_legacy = 'MXN' THEN v_mxn->'subtotal' ELSE v_usd->'subtotal' END,
      'iva', CASE WHEN v_moneda_legacy = 'MXN' THEN v_mxn->'iva' ELSE v_usd->'iva' END,
      'total', CASE WHEN v_moneda_legacy = 'MXN' THEN v_mxn->'total' ELSE v_usd->'total' END,
      'estado_cliente', v_proforma.estado_cliente,
      'aceptada_at', v_proforma.aceptada_at,
      'rechazada_at', v_proforma.rechazada_at,
      'motivo_rechazo', v_proforma.motivo_rechazo,
      'created_at', v_proforma.created_at,
      'token_expira_at', v_proforma.token_expira_at
    ),
    'conceptos', v_conceptos
  );
END $function$;

REVOKE ALL ON FUNCTION public.portal_obtener_proforma_por_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_obtener_proforma_por_token(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.reservar_proforma_email(
  p_proforma_id uuid, p_usuario_id uuid, p_intento uuid, p_reserva uuid,
  p_solicitud jsonb, p_portal_base text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE
  v_proforma public.proformas%ROWTYPE;
  v_intento public.proforma_email_intentos%ROWTYPE;
  v_ahora timestamptz := clock_timestamp();
  v_dias integer := (p_solicitud->>'dias_vigencia')::integer;
  v_total_mxn numeric;
  v_total_usd numeric;
BEGIN
  SELECT * INTO v_proforma FROM public.proformas
  WHERE id = p_proforma_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('estado', 'no_encontrada'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = p_usuario_id AND organization_id = v_proforma.organization_id
  ) THEN RETURN jsonb_build_object('estado', 'sin_acceso'); END IF;
  IF v_proforma.evaluacion_fiscal IS NOT NULL AND v_proforma.consolidada_en IS NOT NULL THEN
    RETURN jsonb_build_object('estado', 'fuente_consolidada');
  END IF;
  IF v_proforma.es_consolidada AND v_proforma.ajuste_consolidacion_aprobado_at IS NULL
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_proforma.evaluacion_fiscal->'ajustes_consolidacion') a
      WHERE (a->>'diferencia')::numeric <> 0) THEN
    RETURN jsonb_build_object('estado', 'ajuste_pendiente');
  END IF;

  SELECT * INTO v_intento FROM public.proforma_email_intentos WHERE id = p_intento FOR UPDATE;
  IF FOUND THEN
    IF (v_intento.proforma_id, v_intento.usuario_id, v_intento.solicitud)
      IS DISTINCT FROM (p_proforma_id, p_usuario_id, p_solicitud) THEN
      RETURN jsonb_build_object('estado', 'intento_distinto');
    END IF;
    IF v_intento.resultado IS NOT NULL THEN
      RETURN jsonb_build_object('estado', 'confirmado', 'resultado', v_intento.resultado);
    END IF;
    IF v_intento.reserva_hasta > v_ahora THEN
      RETURN jsonb_build_object('estado', 'en_proceso');
    END IF;
  ELSE
    IF v_proforma.estado_proforma = 'cancelada' THEN
      RETURN jsonb_build_object('estado', 'cancelada');
    END IF;
    IF v_proforma.token_publico IS NULL OR v_proforma.token_expira_at IS NULL
      OR v_proforma.token_expira_at <= v_ahora THEN
      UPDATE public.proformas SET token_publico = gen_random_uuid(),
        token_expira_at = v_ahora + make_interval(days => v_dias)
      WHERE id = v_proforma.id RETURNING * INTO v_proforma;
    END IF;
    IF v_proforma.evaluacion_fiscal IS NOT NULL THEN
      SELECT COALESCE(max((b->>'total')::numeric) FILTER (WHERE b->>'moneda'='MXN'),0),
        COALESCE(max((b->>'total')::numeric) FILTER (WHERE b->>'moneda'='USD'),0) INTO v_total_mxn, v_total_usd
      FROM jsonb_array_elements(v_proforma.evaluacion_fiscal->'bloques') b;
    ELSE
      v_total_mxn := v_proforma.total_mxn;
      v_total_usd := v_proforma.total_usd;
    END IF;
    INSERT INTO public.proforma_email_intentos (id, proforma_id, usuario_id, solicitud, contenido)
    VALUES (p_intento, p_proforma_id, p_usuario_id, p_solicitud, jsonb_build_object(
      'token', v_proforma.token_publico, 'expira', v_proforma.token_expira_at,
      'enlace', rtrim(p_portal_base, '/') || '/portal/proformas/' || v_proforma.token_publico,
      'numero', v_proforma.numero, 'cliente', v_proforma.cliente_nombre, 'expediente', v_proforma.expediente,
      'total_mxn', v_total_mxn, 'total_usd', v_total_usd
    )) RETURNING * INTO v_intento;
  END IF;

  UPDATE public.proforma_email_intentos SET reserva = p_reserva,
    reserva_hasta = clock_timestamp() + interval '5 minutes'
  WHERE id = p_intento;
  RETURN jsonb_build_object('estado', 'reservado', 'contenido', v_intento.contenido);
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_proforma_email(uuid, uuid, uuid, uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_proforma_email(uuid, uuid, uuid, uuid, jsonb, text) TO service_role;

CREATE TRIGGER zz_isr_grupo_consolidado BEFORE INSERT OR UPDATE OR DELETE ON public.proforma_conceptos_consolidados
FOR EACH ROW EXECUTE FUNCTION public._isr_guard_concepto_consolidado();
REVOKE ALL ON FUNCTION public._isr_guard_concepto_consolidado(),
  public._isr_armar_consolidacion_proformas(uuid[],uuid,uuid,uuid), public._isr_insertar_grupos_consolidacion(uuid,uuid,uuid,jsonb),
  public._isr_consolidar_proformas(uuid,uuid,uuid,uuid[]), public.aprobar_ajuste_consolidacion_proforma(uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aprobar_ajuste_consolidacion_proforma(uuid,text) TO authenticated;

-- Explicit revision of a stored shipment fiscal evaluation. Archive the previous figures atomically.
CREATE TABLE public.embarque_revisiones_fiscales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  embarque_id uuid NOT NULL REFERENCES public.embarques(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  transaccion bigint NOT NULL,
  motivo text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 10 AND 500),
  snapshot_anterior jsonb NOT NULL,
  snapshot_nuevo jsonb NOT NULL,
  conceptos_anteriores jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  aplicada_at timestamptz
);
CREATE INDEX embarque_revisiones_fiscales_embarque_idx ON public.embarque_revisiones_fiscales(embarque_id, created_at);
CREATE UNIQUE INDEX embarque_revisiones_fiscales_abierta_idx ON public.embarque_revisiones_fiscales(embarque_id, transaccion)
  WHERE aplicada_at IS NULL;

ALTER TABLE public.embarque_revisiones_fiscales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embarque_revisiones_fiscales FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.embarque_revisiones_fiscales FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.embarque_revisiones_fiscales TO authenticated, service_role;
CREATE POLICY fiscal_revision_read ON public.embarque_revisiones_fiscales FOR SELECT TO authenticated
  USING (organization_id = public.org_scope() AND public.has_any_role_in_org_exact(auth.uid(),
    ARRAY['admin','admin_org','contador']::public.app_role[], organization_id));
CREATE POLICY fiscal_revision_scope ON public.embarque_revisiones_fiscales AS RESTRICTIVE TO authenticated
  USING (public.rls_tenant_scope_ok(organization_id)) WITH CHECK (public.rls_tenant_scope_ok(organization_id));

CREATE OR REPLACE FUNCTION public._isr_base_revision_venta(p_linea jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT jsonb_build_object('moneda', p_linea->'moneda', 'cantidad', p_linea->'cantidad',
    'precio_unitario', p_linea->'precio_unitario', 'tipo_iva', p_linea->'tipo_iva',
    'aplica_iva', p_linea->'aplica_iva', 'tasa_iva_aplicada', p_linea->'tasa_iva_aplicada');
$$;

CREATE OR REPLACE FUNCTION public._isr_plan_revision_embarque(p_embarque_id uuid,
  p_cliente_id uuid, p_conceptos_venta jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_embarque public.embarques;
  v_anteriores jsonb;
  v_ambiente text;
  v_entrada jsonb;
  v_linea jsonb;
  v_actual jsonb;
  v_candidatas jsonb := '[]';
  v_ids uuid[] := '{}';
  v_id uuid;
  v_aplica_iva boolean;
  v_antes jsonb;
  v_nuevo jsonb;
BEGIN
  SELECT * INTO v_embarque FROM public.embarques WHERE id = p_embarque_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at, c.id), '[]') INTO v_anteriores
  FROM public.conceptos_venta c
  WHERE c.embarque_id = p_embarque_id AND c.organization_id = v_embarque.organization_id AND c.deleted_at IS NULL;
  SELECT l->'evaluacion_fiscal'->>'ambiente' INTO v_ambiente
  FROM jsonb_array_elements(v_anteriores) l WHERE l->'evaluacion_fiscal' <> 'null'::jsonb LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF jsonb_typeof(p_conceptos_venta) IS DISTINCT FROM 'array' OR jsonb_array_length(p_conceptos_venta) > 1000 THEN
    RAISE EXCEPTION 'LC_ISR_IMPORTES_INVALIDOS' USING ERRCODE = '22023';
  END IF;
  FOR v_entrada IN SELECT value FROM jsonb_array_elements(p_conceptos_venta) LOOP
    IF jsonb_typeof(v_entrada) <> 'object' THEN
      RAISE EXCEPTION 'LC_ISR_IMPORTES_INVALIDOS' USING ERRCODE = '22023';
    END IF;
    v_id := NULLIF(v_entrada->>'id', '')::uuid;
    SELECT l INTO v_actual FROM jsonb_array_elements(v_anteriores) l WHERE l->>'id' = v_id::text;
    IF v_id IS NOT NULL AND (v_actual IS NULL OR v_id = ANY(v_ids)) THEN
      RAISE EXCEPTION 'LC_ISR_LINAJE_INVALIDO' USING ERRCODE = '23514';
    END IF;
    IF v_id IS NOT NULL THEN v_ids := array_append(v_ids, v_id); END IF;
    v_aplica_iva := COALESCE((v_entrada->>'aplica_iva')::boolean, (v_actual->>'aplica_iva')::boolean, false);
    -- Resolve omitted fields the same way as the shipment writer.
    v_linea := jsonb_build_object('id', v_id,
      'cantidad', COALESCE((v_entrada->>'cantidad')::numeric, (v_actual->>'cantidad')::numeric, 1),
      'precio_unitario', COALESCE((v_entrada->>'precio_unitario')::numeric, (v_actual->>'precio_unitario')::numeric, 0),
      'moneda', COALESCE(v_entrada->>'moneda', v_actual->>'moneda', 'MXN'),
      'aplica_iva', v_aplica_iva,
      'tipo_iva', CASE WHEN v_entrada ? 'tipo_iva' THEN NULLIF(v_entrada->>'tipo_iva', '') ELSE v_actual->>'tipo_iva' END,
      'tasa_iva_aplicada', CASE WHEN v_aplica_iva THEN COALESCE(NULLIF((v_entrada->>'tasa_iva_aplicada')::numeric, 0),
        NULLIF((v_actual->>'tasa_iva_aplicada')::numeric, 0), .16) ELSE 0 END,
      'tasa_ret_iva', COALESCE((v_entrada->>'tasa_ret_iva')::numeric, 0));
    IF v_actual->>'estado_facturacion' = 'facturado' THEN
      v_linea := jsonb_build_object('id', v_id) || public._isr_base_revision_venta(v_actual);
    END IF;
    v_candidatas := v_candidatas || jsonb_build_array(v_linea);
  END LOOP;
  v_candidatas := v_candidatas || COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l->'id') || public._isr_base_revision_venta(l))
    FROM jsonb_array_elements(v_anteriores) l WHERE l->>'estado_facturacion' <> 'pendiente'
      AND NOT ((l->>'id')::uuid = ANY(v_ids))), '[]');

  IF p_cliente_id IS NOT DISTINCT FROM v_embarque.cliente_id AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_anteriores) a
    FULL JOIN jsonb_array_elements(v_candidatas) b ON a->>'id' = b->>'id'
    WHERE public._isr_base_revision_venta(a) IS DISTINCT FROM public._isr_base_revision_venta(b)
  ) THEN RETURN NULL; END IF;

  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_anteriores) l
    WHERE l->>'estado_facturacion' <> 'pendiente' OR l->>'proforma_id' IS NOT NULL) THEN
    RAISE EXCEPTION 'LC_ISR_EMBARQUE_CON_DOCUMENTOS' USING ERRCODE = '23514';
  END IF;
  v_antes := public._isr_snapshot_documento(v_embarque.organization_id, v_embarque.cliente_id, v_ambiente, v_anteriores);
  v_nuevo := public._evaluar_documento_isr_resico(v_embarque.organization_id, p_cliente_id, v_candidatas);
  RETURN jsonb_build_object('antes', v_antes, 'despues', v_nuevo->'snapshot', 'conceptos_anteriores', v_anteriores,
    'conceptos_nuevos', v_nuevo->'conceptos', 'huella', encode(sha256(convert_to(jsonb_build_array(
      p_embarque_id, v_embarque.updated_at, v_antes, v_nuevo)::text, 'UTF8')), 'hex'));
END;
$$;

CREATE OR REPLACE FUNCTION public.preparar_revision_fiscal_embarque(p_embarque_id uuid, p_cliente_id uuid,
  p_conceptos_venta jsonb, p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_embarque public.embarques;
  v_plan jsonb;
BEGIN
  SELECT * INTO v_embarque FROM public.embarques WHERE id = p_embarque_id AND deleted_at IS NULL;
  IF v_embarque.id IS NULL OR v_embarque.organization_id IS DISTINCT FROM public.org_scope() THEN
    RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  PERFORM public._assert_writer(v_embarque.organization_id);
  IF v_embarque.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'LC_CONFLICTO_CONCURRENCIA' USING ERRCODE = '40001';
  END IF;
  PERFORM public._assert_relaciones_embarque(v_embarque.organization_id,
    COALESCE(p_cliente_id, v_embarque.cliente_id), NULL, '[]');
  v_plan := public._isr_plan_revision_embarque(p_embarque_id, COALESCE(p_cliente_id, v_embarque.cliente_id), p_conceptos_venta);
  IF v_plan IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('antes', v_plan->'antes', 'despues', v_plan->'despues', 'huella', v_plan->'huella',
    'puede_autorizar', public.has_any_role_in_org_exact(auth.uid(), ARRAY['admin','admin_org','contador']::public.app_role[],
      v_embarque.organization_id));
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
    IF EXISTS (SELECT 1 FROM public.proforma_conceptos_consolidados WHERE proforma_id=OLD.id AND evaluacion_fiscal IS NOT NULL)
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
    IF EXISTS(SELECT 1 FROM public.conceptos_venta WHERE embarque_id=NEW.embarque_id AND proforma_id IS NOT NULL) THEN
      RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514';
    END IF;
    IF NEW.proforma_id IS NOT NULL OR NEW.estado_facturacion <> 'pendiente' THEN
      RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT cliente_id,organization_id INTO v_cliente,v_parent_org FROM public.proformas
      WHERE id=NEW.proforma_id AND estado_aprobacion='borrador' AND estado_proforma='pendiente'
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

-- Espejo R4: borrador explícito y snapshot comercial, sin backfill histórico.
CREATE OR REPLACE FUNCTION public.actualizar_embarque_completo(p_embarque_id uuid, p_embarque jsonb, p_conceptos_venta jsonb DEFAULT '[]'::jsonb, p_conceptos_costo jsonb DEFAULT '[]'::jsonb, p_request_id uuid DEFAULT NULL::uuid, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_resp jsonb;
  cv jsonb;
  cc jsonb;
  v_incoming_venta_ids uuid[];
  v_incoming_costo_ids uuid[];
  v_new_id uuid;
  v_current_updated_at timestamptz;
  v_embarque_actual public.embarques;
  v_cliente_nuevo uuid;
  v_plan_fiscal jsonb;
  v_confirmacion_fiscal jsonb := p_embarque->'revision_fiscal';
  v_revision_id uuid;
  v_lineas_guardadas jsonb;
  v_lineas_confirmadas jsonb;
BEGIN
  SELECT * INTO v_embarque_actual
    FROM embarques
   WHERE id = p_embarque_id
   FOR UPDATE;
  v_org_id := v_embarque_actual.organization_id;
  v_current_updated_at := v_embarque_actual.updated_at;
  v_cliente_nuevo := COALESCE(NULLIF(p_embarque->>'cliente_id','')::uuid, v_embarque_actual.cliente_id);
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Embarque no encontrado'; END IF;
  PERFORM public._assert_writer(v_org_id);
  v_resp := public.idempotency_claim(p_request_id, 'actualizar_embarque_completo');
  IF v_resp IS NOT NULL THEN
    IF v_resp->>'embarque_id' IS DISTINCT FROM p_embarque_id::text THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE = '23514';
    END IF;
    RETURN v_resp;
  END IF;
  IF p_expected_updated_at IS NOT NULL
     AND v_current_updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'LC_CONFLICTO_CONCURRENCIA: otro usuario modificó este embarque. Recarga y vuelve a intentar.'
      USING ERRCODE = '40001',
            HINT = json_build_object(
              'server_updated_at', v_current_updated_at,
              'client_expected_updated_at', p_expected_updated_at
            )::text;
  END IF;
  PERFORM public._assert_relaciones_embarque(
    v_org_id,
    v_cliente_nuevo,
    NULLIF(p_embarque->>'cotizacion_id','')::uuid,
    p_conceptos_costo
  );
  v_plan_fiscal := public._isr_plan_revision_embarque(p_embarque_id, v_cliente_nuevo, p_conceptos_venta);
  IF v_plan_fiscal IS NOT NULL OR v_confirmacion_fiscal IS NOT NULL THEN
    IF v_org_id IS DISTINCT FROM public.org_scope() OR NOT public.has_any_role_in_org_exact(auth.uid(),
      ARRAY['admin','admin_org','contador']::public.app_role[], v_org_id) THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
    END IF;
    IF v_plan_fiscal IS NULL OR v_embarque_actual.deleted_at IS NOT NULL OR p_expected_updated_at IS NULL
      OR v_confirmacion_fiscal->>'huella' IS DISTINCT FROM v_plan_fiscal->>'huella'
      OR length(btrim(COALESCE(v_confirmacion_fiscal->>'motivo', ''))) NOT BETWEEN 10 AND 500 THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE = '23514';
    END IF;
    INSERT INTO public.embarque_revisiones_fiscales (organization_id, embarque_id, actor_id, transaccion,
      motivo, snapshot_anterior, snapshot_nuevo, conceptos_anteriores)
    VALUES (v_org_id, p_embarque_id, auth.uid(), txid_current(), btrim(v_confirmacion_fiscal->>'motivo'),
      v_plan_fiscal->'antes', v_plan_fiscal->'despues', v_plan_fiscal->'conceptos_anteriores')
    RETURNING id INTO v_revision_id;
  END IF;
  IF NULLIF(p_embarque->>'tarifa_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.costeo_tarifas t
    WHERE t.id = (p_embarque->>'tarifa_id')::uuid AND t.organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'LC_EMBARQUE_TARIFA_INVALIDA: la tarifa no pertenece a tu organización'
      USING ERRCODE = 'P0001';
  END IF;
  UPDATE embarques SET
    cliente_id = COALESCE((p_embarque->>'cliente_id')::uuid, cliente_id),
    cliente_nombre = COALESCE(p_embarque->>'cliente_nombre', cliente_nombre),
    modo = COALESCE((p_embarque->>'modo')::modo_transporte, modo),
    tipo = COALESCE((p_embarque->>'tipo')::tipo_operacion, tipo),
    incoterm = COALESCE((p_embarque->>'incoterm')::incoterm, incoterm),
    bl_master = CASE WHEN p_embarque ? 'bl_master' THEN p_embarque->>'bl_master' ELSE bl_master END,
    bl_house = CASE WHEN p_embarque ? 'bl_house' THEN p_embarque->>'bl_house' ELSE bl_house END,
    naviera = CASE WHEN p_embarque ? 'naviera' THEN p_embarque->>'naviera' ELSE naviera END,
    naviera_id = CASE WHEN p_embarque ? 'naviera_id' THEN NULLIF(p_embarque->>'naviera_id','')::uuid ELSE naviera_id END,
    puerto_origen = CASE WHEN p_embarque ? 'puerto_origen' THEN p_embarque->>'puerto_origen' ELSE puerto_origen END,
    puerto_destino = CASE WHEN p_embarque ? 'puerto_destino' THEN p_embarque->>'puerto_destino' ELSE puerto_destino END,
    aeropuerto_origen = CASE WHEN p_embarque ? 'aeropuerto_origen' THEN p_embarque->>'aeropuerto_origen' ELSE aeropuerto_origen END,
    aeropuerto_destino = CASE WHEN p_embarque ? 'aeropuerto_destino' THEN p_embarque->>'aeropuerto_destino' ELSE aeropuerto_destino END,
    ciudad_origen = CASE WHEN p_embarque ? 'ciudad_origen' THEN p_embarque->>'ciudad_origen' ELSE ciudad_origen END,
    ciudad_destino = CASE WHEN p_embarque ? 'ciudad_destino' THEN p_embarque->>'ciudad_destino' ELSE ciudad_destino END,
    aerolinea = CASE WHEN p_embarque ? 'aerolinea' THEN p_embarque->>'aerolinea' ELSE aerolinea END,
    transportista = CASE WHEN p_embarque ? 'transportista' THEN p_embarque->>'transportista' ELSE transportista END,
    agente = CASE WHEN p_embarque ? 'agente' THEN p_embarque->>'agente' ELSE agente END,
    agente_id = CASE WHEN p_embarque ? 'agente_id' THEN NULLIF(p_embarque->>'agente_id','')::uuid ELSE agente_id END,
    shipper = COALESCE(p_embarque->>'shipper', shipper),
    consignatario = COALESCE(p_embarque->>'consignatario', consignatario),
    descripcion_mercancia = COALESCE(p_embarque->>'descripcion_mercancia', descripcion_mercancia),
    tipo_carga = COALESCE(p_embarque->>'tipo_carga', tipo_carga),
    tipo_servicio = CASE WHEN p_embarque ? 'tipo_servicio' THEN (p_embarque->>'tipo_servicio')::tipo_servicio_maritimo ELSE tipo_servicio END,
    operador = COALESCE(p_embarque->>'operador', operador),
    contenedor = CASE WHEN p_embarque ? 'contenedor' THEN p_embarque->>'contenedor' ELSE contenedor END,
    tipo_contenedor = CASE WHEN p_embarque ? 'tipo_contenedor' THEN p_embarque->>'tipo_contenedor' ELSE tipo_contenedor END,
    peso_kg = COALESCE((p_embarque->>'peso_kg')::numeric, peso_kg),
    volumen_m3 = COALESCE((p_embarque->>'volumen_m3')::numeric, volumen_m3),
    piezas = COALESCE((p_embarque->>'piezas')::int, piezas),
    mawb = CASE WHEN p_embarque ? 'mawb' THEN p_embarque->>'mawb' ELSE mawb END,
    hawb = CASE WHEN p_embarque ? 'hawb' THEN p_embarque->>'hawb' ELSE hawb END,
    carta_porte = CASE WHEN p_embarque ? 'carta_porte' THEN p_embarque->>'carta_porte' ELSE carta_porte END,
    etd = CASE WHEN p_embarque ? 'etd' THEN (p_embarque->>'etd')::date ELSE etd END,
    eta = CASE WHEN p_embarque ? 'eta' THEN (p_embarque->>'eta')::date ELSE eta END,
    tipo_cambio_usd = COALESCE(NULLIF(NULLIF(p_embarque->>'tipo_cambio_usd','')::numeric, 0), tipo_cambio_usd),
    tipo_cambio_eur = COALESCE(NULLIF(NULLIF(p_embarque->>'tipo_cambio_eur','')::numeric, 0), tipo_cambio_eur),
    msds_archivo = CASE WHEN p_embarque ? 'msds_archivo' THEN p_embarque->>'msds_archivo' ELSE msds_archivo END,
    tarifa_id = CASE WHEN p_embarque ? 'tarifa_id' THEN NULLIF(p_embarque->>'tarifa_id', '')::uuid ELSE tarifa_id END,
    carta_garantia = CASE WHEN p_embarque ? 'carta_garantia' THEN COALESCE((p_embarque->>'carta_garantia')::boolean, false) ELSE carta_garantia END,
    dias_libres_destino = CASE WHEN p_embarque ? 'dias_libres_destino' THEN COALESCE((p_embarque->>'dias_libres_destino')::integer, 0) ELSE dias_libres_destino END,
    dias_almacenaje = CASE WHEN p_embarque ? 'dias_almacenaje' THEN COALESCE((p_embarque->>'dias_almacenaje')::integer, 0) ELSE dias_almacenaje END,
    seguro = CASE WHEN p_embarque ? 'seguro' THEN COALESCE((p_embarque->>'seguro')::boolean, false) ELSE seguro END,
    valor_seguro_usd = CASE WHEN p_embarque ? 'valor_seguro_usd' THEN NULLIF(p_embarque->>'valor_seguro_usd', '')::numeric ELSE valor_seguro_usd END,
    notas = CASE WHEN p_embarque ? 'notas' THEN NULLIF(p_embarque->>'notas', '') ELSE notas END,
    updated_at = now()
  WHERE id = p_embarque_id;
  v_incoming_venta_ids := ARRAY(
    SELECT (elem->>'id')::uuid
      FROM jsonb_array_elements(p_conceptos_venta) elem
     WHERE elem ? 'id' AND elem->>'id' IS NOT NULL AND elem->>'id' <> ''
  );
  FOR cv IN SELECT * FROM jsonb_array_elements(p_conceptos_venta) LOOP
    IF COALESCE((cv->>'tasa_ret_iva')::numeric, 0) <> 0 THEN
      RAISE EXCEPTION 'LC_ISR_RETENCION_NO_SOPORTADA' USING ERRCODE = '22023';
    END IF;
    IF cv ? 'id' AND cv->>'id' IS NOT NULL AND cv->>'id' <> '' THEN
      IF cv ? 'cotizacion_concepto_origen_id' AND EXISTS (
        SELECT 1 FROM public.conceptos_venta c
         WHERE c.id = (cv->>'id')::uuid AND c.embarque_id = p_embarque_id
           AND c.cotizacion_concepto_origen_id IS DISTINCT FROM cv->>'cotizacion_concepto_origen_id'
      ) THEN
        RAISE EXCEPTION 'LC_ISR_LINAJE_INVALIDO' USING ERRCODE = '23514';
      END IF;
      -- El trigger conserva el vínculo y calcula el ISR con los datos vigentes.
      UPDATE conceptos_venta SET
        descripcion = COALESCE(cv->>'descripcion', descripcion),
        cantidad = COALESCE((cv->>'cantidad')::numeric, cantidad),
        precio_unitario = COALESCE((cv->>'precio_unitario')::numeric, precio_unitario),
        moneda = COALESCE((cv->>'moneda')::moneda, moneda),
        total = COALESCE((cv->>'total')::numeric, total),
        aplica_iva = COALESCE((cv->>'aplica_iva')::boolean, aplica_iva),
        -- C22 (v13.823.380): una línea exenta jamás conserva tasa > 0, ni
        -- cuando el payload omite la tasa ni cuando arrastra una legacy (0.16).
        -- La columna es NOT NULL, así que la convención es 0, no NULL.
        -- C28 (v13.823.381): reactivar el IVA de una línea antes exenta dejaba
        -- tasa 0 (línea gravada sin IVA). Orden: tasa positiva enviada →
        -- tasa positiva previa → fallback canónico 0.16.
        tasa_iva_aplicada = CASE
          WHEN COALESCE((cv->>'aplica_iva')::boolean, aplica_iva) = false THEN 0
          ELSE COALESCE(
            NULLIF((cv->>'tasa_iva_aplicada')::numeric, 0),
            NULLIF(tasa_iva_aplicada, 0),
            0.16)
        END,
        tipo_iva = CASE
          WHEN cv ? 'tipo_iva' THEN NULLIF(cv->>'tipo_iva', '')
          ELSE tipo_iva
        END
      WHERE id = (cv->>'id')::uuid
        AND embarque_id = p_embarque_id
        AND deleted_at IS NULL
        AND estado_facturacion IN ('pendiente', 'en_proforma');
    ELSE
      INSERT INTO conceptos_venta (
        embarque_id, descripcion, cantidad, precio_unitario, moneda, total, contenedor_id,
        aplica_iva, tasa_iva_aplicada, tipo_iva, organization_id
      ) VALUES (
        p_embarque_id,
        cv->>'descripcion',
        COALESCE((cv->>'cantidad')::numeric, 1),
        COALESCE((cv->>'precio_unitario')::numeric, 0),
        COALESCE((cv->>'moneda')::moneda, 'MXN'::moneda),
        COALESCE((cv->>'total')::numeric, 0),
        NULLIF(cv->>'contenedor_id','')::uuid,
        COALESCE((cv->>'aplica_iva')::boolean, false),
        -- C22: alta coherente — exento => 0; gravado => tasa explícita o el
        -- fallback canónico vigente (0.16).
        CASE
          WHEN COALESCE((cv->>'aplica_iva')::boolean, false) = false THEN 0
          ELSE COALESCE(NULLIF((cv->>'tasa_iva_aplicada')::numeric, 0), 0.16)
        END,
        NULLIF(cv->>'tipo_iva', ''),
        v_org_id
      )
      RETURNING id INTO v_new_id;
      v_incoming_venta_ids := array_append(v_incoming_venta_ids, v_new_id);
    END IF;
  END LOOP;
  UPDATE conceptos_venta
     SET deleted_at = now()
   WHERE embarque_id = p_embarque_id
     AND deleted_at IS NULL
     AND estado_facturacion = 'pendiente'
     AND NOT (id = ANY(v_incoming_venta_ids));
  IF v_revision_id IS NOT NULL THEN
    -- Reconcile the approved fiscal inputs with the exact data saved by the normal writer.
    SELECT COALESCE(jsonb_agg(datos ORDER BY datos), '[]') INTO v_lineas_guardadas
    FROM (SELECT public._isr_base_revision_venta(to_jsonb(c)) ||
        jsonb_build_object('evaluacion_fiscal', c.evaluacion_fiscal) datos
      FROM public.conceptos_venta c WHERE c.embarque_id = p_embarque_id AND c.deleted_at IS NULL) guardadas;
    SELECT COALESCE(jsonb_agg(datos ORDER BY datos), '[]') INTO v_lineas_confirmadas
    FROM (SELECT public._isr_base_revision_venta(l) || jsonb_build_object('evaluacion_fiscal', l->'evaluacion_fiscal') datos
      FROM jsonb_array_elements(v_plan_fiscal->'conceptos_nuevos') l) confirmadas;
    IF v_lineas_guardadas IS DISTINCT FROM v_lineas_confirmadas THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE = '23514';
    END IF;
    UPDATE public.embarque_revisiones_fiscales SET aplicada_at = clock_timestamp() WHERE id = v_revision_id;
  END IF;
  v_incoming_costo_ids := ARRAY(
    SELECT (elem->>'id')::uuid
      FROM jsonb_array_elements(p_conceptos_costo) elem
     WHERE elem ? 'id' AND elem->>'id' IS NOT NULL AND elem->>'id' <> ''
  );
  FOR cc IN SELECT * FROM jsonb_array_elements(p_conceptos_costo) LOOP
    IF cc ? 'id' AND cc->>'id' IS NOT NULL AND cc->>'id' <> '' THEN
      UPDATE conceptos_costo SET
        concepto = COALESCE(cc->>'concepto', concepto),
        proveedor_nombre = CASE
          WHEN cc ? 'proveedor_nombre' AND COALESCE(btrim(cc->>'proveedor_nombre'), '') <> ''
            THEN cc->>'proveedor_nombre'
          ELSE proveedor_nombre
        END,
        proveedor_id = CASE
          WHEN cc ? 'proveedor_id' AND cc->>'proveedor_id' IS NOT NULL AND cc->>'proveedor_id' <> ''
            THEN (cc->>'proveedor_id')::uuid
          ELSE proveedor_id
        END,
        moneda = COALESCE((cc->>'moneda')::moneda, moneda),
        monto = COALESCE((cc->>'monto')::numeric, monto)
      WHERE id = (cc->>'id')::uuid
        AND embarque_id = p_embarque_id
        AND COALESCE(estado_liquidacion, 'Pendiente') <> 'Pagado';
    ELSE
      INSERT INTO conceptos_costo (
        embarque_id, concepto, proveedor_id, proveedor_nombre, moneda, monto, contenedor_id, organization_id
      ) VALUES (
        p_embarque_id,
        cc->>'concepto',
        NULLIF(cc->>'proveedor_id','')::uuid,
        COALESCE(cc->>'proveedor_nombre',''),
        COALESCE((cc->>'moneda')::moneda, 'MXN'::moneda),
        COALESCE((cc->>'monto')::numeric, 0),
        NULLIF(cc->>'contenedor_id','')::uuid,
        v_org_id
      )
      RETURNING id INTO v_new_id;
      v_incoming_costo_ids := array_append(v_incoming_costo_ids, v_new_id);
    END IF;
  END LOOP;
  UPDATE conceptos_costo
     SET deleted_at = now()
   WHERE embarque_id = p_embarque_id
     AND deleted_at IS NULL
     AND COALESCE(estado_liquidacion, 'Pendiente') <> 'Pagado'
     AND NOT EXISTS (
       SELECT 1 FROM public.proveedor_facturas_conceptos pfc
        WHERE pfc.concepto_costo_id = conceptos_costo.id
     )
     AND NOT (id = ANY(v_incoming_costo_ids));
  v_resp := jsonb_build_object('ok', true, 'embarque_id', p_embarque_id);
  PERFORM public.idempotency_store(p_request_id, v_resp);
  RETURN v_resp;
END;
$function$;
REVOKE ALL ON FUNCTION public.actualizar_embarque_completo(uuid, jsonb, jsonb, jsonb, uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_embarque_completo(uuid, jsonb, jsonb, jsonb, uuid, timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public._isr_base_revision_venta(jsonb),
  public._isr_plan_revision_embarque(uuid, uuid, jsonb),
  public.preparar_revision_fiscal_embarque(uuid, uuid, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preparar_revision_fiscal_embarque(uuid, uuid, jsonb, timestamptz) TO authenticated;

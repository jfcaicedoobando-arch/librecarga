-- Stage 3: opt-in quotation and shipment fiscal capture. No backfill or proforma release.
ALTER TABLE public.conceptos_venta ADD COLUMN cotizacion_concepto_origen_id text;
CREATE UNIQUE INDEX conceptos_venta_cotizacion_linaje_uq ON public.conceptos_venta(embarque_id,cotizacion_concepto_origen_id)
  WHERE cotizacion_concepto_origen_id IS NOT NULL AND deleted_at IS NULL;
CREATE TABLE public.cotizacion_revisiones_fiscales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id),
  cotizacion_id uuid NOT NULL REFERENCES public.cotizaciones(id), snapshot_anterior jsonb NOT NULL,
  conceptos_anteriores jsonb NOT NULL, estado_anterior text NOT NULL, motivo text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id), transaccion bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cotizacion_revisiones_fiscales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_revisiones_fiscales FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.cotizacion_revisiones_fiscales FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.cotizacion_revisiones_fiscales TO authenticated,service_role;
CREATE POLICY fiscal_revision_read ON public.cotizacion_revisiones_fiscales FOR SELECT TO authenticated
  USING(organization_id=public.org_scope() AND public.has_any_role_in_org_exact(auth.uid(),
    ARRAY['admin','admin_org','contador','gerente_comercial','vendedor']::public.app_role[],organization_id));
CREATE POLICY fiscal_revision_scope ON public.cotizacion_revisiones_fiscales AS RESTRICTIVE TO authenticated
  USING(public.rls_tenant_scope_ok(organization_id)) WITH CHECK(public.rls_tenant_scope_ok(organization_id));

CREATE OR REPLACE FUNCTION public._isr_documento_habilitado(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS(SELECT 1 FROM public.configuracion WHERE organization_id=p_org_id
    AND categoria='facturacion' AND clave='isr_resico_automatico' AND valor='true'::jsonb);
$$;

-- Read only aggregation of already evaluated lines. Never refreshes approved tax identity.
CREATE OR REPLACE FUNCTION public._isr_snapshot_documento(p_org_id uuid,p_cliente_id uuid,p_ambiente text,p_conceptos jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_bloques jsonb; v_motivos jsonb; v_pendiente boolean; v_primero jsonb;
BEGIN
  IF jsonb_typeof(p_conceptos) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'LC_ISR_IMPORTES_INVALIDOS' USING ERRCODE='22023';
  END IF;
  WITH lineas AS (
    SELECT COALESCE(l->>'moneda','MXN') moneda,
      (l->>'cantidad')::numeric*(l->>'precio_unitario')::numeric base,
      CASE WHEN l->>'tipo_iva' IN ('gravado_16','gravado_8')
        THEN COALESCE((l->>'tasa_iva_aplicada')::numeric,CASE WHEN l->>'tipo_iva'='gravado_8' THEN .08 ELSE .16 END) ELSE 0 END iva,
      COALESCE((l->'evaluacion_fiscal'->>'tasa_ret_isr')::numeric,0) isr
    FROM jsonb_array_elements(p_conceptos) l
  ), bases AS (SELECT moneda,round(sum(base),2) subtotal FROM lineas GROUP BY moneda),
  impuestos AS (
    SELECT moneda,'iva' tipo,round(sum(base*iva),2) monto FROM lineas GROUP BY moneda,iva
    UNION ALL SELECT moneda,'isr',round(sum(base*isr),2) FROM lineas GROUP BY moneda,isr
  ) SELECT COALESCE(jsonb_agg(jsonb_build_object('moneda',b.moneda,'subtotal',b.subtotal,
      'iva',t.iva,'ret_isr',t.isr,'ret_iva',0,'total',b.subtotal+t.iva-t.isr) ORDER BY b.moneda),'[]') INTO v_bloques
    FROM bases b CROSS JOIN LATERAL (SELECT COALESCE(sum(monto) FILTER(WHERE tipo='iva'),0) iva,
      COALESCE(sum(monto) FILTER(WHERE tipo='isr'),0) isr FROM impuestos WHERE moneda=b.moneda) t;
  SELECT COALESCE(bool_or(l->'evaluacion_fiscal'->>'estado' IS NULL OR l->'evaluacion_fiscal'->>'estado'='pendiente'),true),
    COALESCE(jsonb_agg(DISTINCT l->'evaluacion_fiscal'->>'motivo') FILTER(WHERE l->'evaluacion_fiscal'->>'estado'='pendiente'),'[]')
    INTO v_pendiente,v_motivos FROM jsonb_array_elements(p_conceptos) l;
  IF jsonb_array_length(p_conceptos)=0 THEN v_motivos:='["sin_conceptos"]'; END IF;
  v_primero:=p_conceptos->0->'evaluacion_fiscal';
  RETURN jsonb_build_object('schema_version','cotizacion_fiscal_v1','estado',CASE WHEN v_pendiente THEN 'pendiente' ELSE 'confirmado' END,
    'organization_id',p_org_id,'cliente_id',p_cliente_id,'ambiente',p_ambiente,
    'perfil_id',v_primero->'perfil_id','perfil_version',v_primero->'perfil_version',
    'regla_version','resico_113j_v1','precision_version','base_exacta_impuesto_2_v1',
    'conceptos_fingerprint',md5(p_conceptos::text),'bloques',v_bloques,'motivos',v_motivos);
END;
$$;

CREATE OR REPLACE FUNCTION public._evaluar_documento_isr_resico(p_org_id uuid,p_cliente_id uuid,p_conceptos jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_ambiente text; v_linea jsonb; v_eval jsonb; v_lineas jsonb:='[]'; v_tipo text; v_iva numeric;
BEGIN
  IF jsonb_typeof(p_conceptos) IS DISTINCT FROM 'array' OR jsonb_array_length(p_conceptos)>1000 THEN
    RAISE EXCEPTION 'LC_ISR_IMPORTES_INVALIDOS' USING ERRCODE='22023';
  END IF;
  SELECT ambiente INTO v_ambiente FROM public.facturapi_credenciales WHERE organization_id=p_org_id;
  -- No connection is a pending classification, not permission to infer a live issuer.
  v_ambiente:=COALESCE(v_ambiente,'sandbox');
  FOR v_linea IN SELECT value FROM jsonb_array_elements(p_conceptos) LOOP
    IF COALESCE(v_linea->>'moneda','MXN') NOT IN ('MXN','USD') THEN
      RAISE EXCEPTION 'LC_COT_MONEDA_NO_SOPORTADA' USING ERRCODE='22023';
    END IF;
    IF COALESCE((v_linea->>'tasa_ret_iva')::numeric,0)<>0 THEN
      RAISE EXCEPTION 'LC_ISR_RETENCION_NO_SOPORTADA' USING ERRCODE='22023';
    END IF;
    v_tipo:=v_linea->>'tipo_iva';
    v_iva:=NULLIF(v_linea->>'tasa_iva_aplicada','')::numeric;
    IF v_tipo IS NULL THEN
      v_tipo:=CASE WHEN v_iva=.16 THEN 'gravado_16' WHEN v_iva=.08 THEN 'gravado_8' WHEN v_iva=0 THEN 'tasa_0' END;
    END IF;
    v_eval:=public._evaluar_isr_resico(p_org_id,p_cliente_id,v_ambiente,
      (v_linea->>'cantidad')::numeric,(v_linea->>'precio_unitario')::numeric,v_tipo);
    IF (v_tipo='gravado_16' AND v_iva IS NOT NULL AND v_iva<>.16)
      OR (v_tipo='gravado_8' AND v_iva IS NOT NULL AND v_iva<>.08)
      OR (v_tipo IN ('tasa_0','exento','no_objeto') AND COALESCE(v_iva,0)<>0) THEN
      v_eval:=v_eval||jsonb_build_object('estado','pendiente','motivo','clasificacion_pendiente','tasa_ret_isr',NULL,'monto_ret_isr',NULL);
    END IF;
    v_lineas:=v_lineas||jsonb_build_array(v_linea||jsonb_build_object('tipo_iva',v_tipo,
      'evaluacion_fiscal',v_eval,'tasa_ret_isr',v_eval->'tasa_ret_isr','monto_ret_isr',v_eval->'monto_ret_isr'));
  END LOOP;
  RETURN jsonb_build_object('snapshot',public._isr_snapshot_documento(p_org_id,p_cliente_id,v_ambiente,v_lineas),'conceptos',v_lineas);
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluar_documento_isr_resico(p_org_id uuid,p_cliente_id uuid,p_conceptos jsonb,
  p_cotizacion_id uuid DEFAULT NULL,p_embarque_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_opt boolean; v_resultado jsonb;
BEGIN
  IF p_org_id IS DISTINCT FROM public.org_scope() OR NOT public.has_any_role_in_org_exact(auth.uid(),
    ARRAY['admin','admin_org','contador','auxiliar_contable','operador','vendedor','gerente_comercial',
      'gerente_operaciones','coordinador_logistico','ejecutivo_pricing','customer_service','tesorero','ejecutivo_cobranza']::public.app_role[],p_org_id) THEN
    RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE='42501';
  END IF;
  v_opt:=public._isr_documento_habilitado(p_org_id);
  IF p_cotizacion_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.cotizaciones WHERE id=p_cotizacion_id AND organization_id=p_org_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE='42501';
    END IF;
    v_opt:=v_opt OR EXISTS(SELECT 1 FROM public.cotizaciones WHERE id=p_cotizacion_id AND evaluacion_fiscal IS NOT NULL);
  END IF;
  IF p_embarque_id IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.embarques WHERE id=p_embarque_id AND organization_id=p_org_id AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE='42501';
    END IF;
    v_opt:=v_opt OR EXISTS(SELECT 1 FROM public.conceptos_venta WHERE embarque_id=p_embarque_id AND evaluacion_fiscal IS NOT NULL);
  END IF;
  IF NOT v_opt THEN RETURN jsonb_build_object('snapshot',NULL,'conceptos',p_conceptos); END IF;
  v_resultado:=public._evaluar_documento_isr_resico(p_org_id,p_cliente_id,p_conceptos);
  RETURN jsonb_set(v_resultado,'{conceptos}',COALESCE((SELECT jsonb_agg(l||jsonb_build_object('evaluacion_fiscal',
    (l->'evaluacion_fiscal')-'emisor'-'receptor')) FROM jsonb_array_elements(v_resultado->'conceptos') l),'[]'));
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_evaluacion_fiscal_embarque(p_embarque_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_emb public.embarques; v_lineas jsonb; v_ambiente text;
BEGIN
  SELECT * INTO v_emb FROM public.embarques WHERE id=p_embarque_id AND deleted_at IS NULL;
  IF v_emb.id IS NULL OR v_emb.organization_id IS DISTINCT FROM public.org_scope() OR NOT public.has_any_role_in_org_exact(auth.uid(),
    ARRAY['admin','admin_org','contador','auxiliar_contable','operador','vendedor','gerente_comercial',
      'gerente_operaciones','coordinador_logistico','ejecutivo_pricing','customer_service','tesorero','ejecutivo_cobranza']::public.app_role[],v_emb.organization_id) THEN
    RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE='42501';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at,c.id),'[]') INTO v_lineas
    FROM public.conceptos_venta c WHERE embarque_id=p_embarque_id AND deleted_at IS NULL;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_lineas) l WHERE l->'evaluacion_fiscal' <> 'null'::jsonb) THEN
    RETURN jsonb_build_object('snapshot',NULL,'conceptos',v_lineas);
  END IF;
  SELECT l->'evaluacion_fiscal'->>'ambiente' INTO v_ambiente FROM jsonb_array_elements(v_lineas) l
    WHERE l->'evaluacion_fiscal' <> 'null'::jsonb LIMIT 1;
  RETURN jsonb_build_object('snapshot',public._isr_snapshot_documento(v_emb.organization_id,v_emb.cliente_id,v_ambiente,v_lineas),
    'conceptos',COALESCE((SELECT jsonb_agg(l||jsonb_build_object('evaluacion_fiscal',(l->'evaluacion_fiscal')-'emisor'-'receptor'))
      FROM jsonb_array_elements(v_lineas) l),'[]'));
END;
$$;

CREATE OR REPLACE FUNCTION public.revisar_cotizacion_fiscal(p_cotizacion_id uuid,p_expected_fingerprint text,p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_cot public.cotizaciones; v_resultado jsonb;
BEGIN
  SELECT * INTO v_cot FROM public.cotizaciones WHERE id=p_cotizacion_id AND deleted_at IS NULL FOR UPDATE;
  IF v_cot.id IS NULL OR v_cot.organization_id IS DISTINCT FROM public.org_scope() OR NOT public.has_any_role_in_org_exact(auth.uid(),
    ARRAY['admin','admin_org','gerente_comercial']::public.app_role[],v_cot.organization_id) THEN
    RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE='42501';
  END IF;
  IF length(btrim(COALESCE(p_motivo,'')))<10 OR v_cot.evaluacion_fiscal IS NULL
    OR p_expected_fingerprint IS DISTINCT FROM v_cot.evaluacion_fiscal->>'conceptos_fingerprint' THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
  END IF;
  IF v_cot.embarque_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.embarques WHERE cotizacion_id=v_cot.id AND deleted_at IS NULL AND estado::text<>'Cancelado') THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.cotizacion_revisiones_fiscales(organization_id,cotizacion_id,snapshot_anterior,conceptos_anteriores,estado_anterior,motivo,actor_id,transaccion)
    VALUES(v_cot.organization_id,v_cot.id,v_cot.evaluacion_fiscal,v_cot.conceptos_venta,v_cot.estado::text,btrim(p_motivo),auth.uid(),txid_current());
  PERFORM set_config('lc.cot_autorizacion','1',true);
  UPDATE public.cotizaciones SET estado='Borrador',autorizada_at=NULL,autorizada_por=NULL,margen_autorizado_pct=NULL,
    autorizacion_motivo=NULL,autorizacion_solicitada_at=NULL WHERE id=v_cot.id RETURNING evaluacion_fiscal INTO v_resultado;
  PERFORM set_config('lc.cot_autorizacion','',true);
  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_cotizacion_fiscal_envio(p_cotizacion_id uuid,p_expected_fingerprint text,p_usuario_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_cot public.cotizaciones; v_actual jsonb;
BEGIN
  SELECT * INTO v_cot FROM public.cotizaciones WHERE id=p_cotizacion_id AND deleted_at IS NULL;
  IF v_cot.id IS NULL OR p_usuario_id IS NULL OR NOT public.has_any_role_in_org_exact(p_usuario_id,
    ARRAY['admin','admin_org','gerente_comercial','vendedor','ejecutivo_pricing']::public.app_role[],v_cot.organization_id)
    OR NOT EXISTS(SELECT 1 FROM public.organization_members WHERE user_id=p_usuario_id AND organization_id=v_cot.organization_id) THEN
    RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE='42501';
  END IF;
  IF v_cot.evaluacion_fiscal IS NULL THEN
    IF p_expected_fingerprint IS NOT NULL THEN RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514'; END IF;
    RETURN NULL;
  END IF;
  IF v_cot.evaluacion_fiscal->>'estado' IS DISTINCT FROM 'confirmado'
    OR p_expected_fingerprint IS DISTINCT FROM v_cot.evaluacion_fiscal->>'conceptos_fingerprint'
    OR v_cot.autorizada_at IS NULL OR v_cot.estado::text NOT IN ('Borrador','Solicitada','Enviada','Aceptada') THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
  END IF;
  v_actual:=public._evaluar_documento_isr_resico(v_cot.organization_id,v_cot.cliente_id,v_cot.conceptos_venta);
  IF v_actual->'conceptos' IS DISTINCT FROM v_cot.conceptos_venta THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
  END IF;
  RETURN v_cot.evaluacion_fiscal;
END;
$$;

CREATE OR REPLACE FUNCTION public._isr_guard_cotizacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_resultado jsonb; v_lineas jsonb; v_old_eval jsonb; v_revision boolean:=false; v_cambio boolean;
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.evaluacion_fiscal IS NOT NULL THEN RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    v_old_eval:=OLD.evaluacion_fiscal;
    IF v_old_eval IS NOT NULL AND (NEW.organization_id,NEW.deleted_at) IS DISTINCT FROM (OLD.organization_id,OLD.deleted_at) THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
    END IF;
    IF v_old_eval IS NOT NULL AND NEW.evaluacion_fiscal IS NULL THEN
      RAISE EXCEPTION 'LC_ISR_NO_DESACTIVAR' USING ERRCODE='23514';
    END IF;
    IF v_old_eval IS NOT NULL AND OLD.estado::text NOT IN ('Borrador','Solicitada') THEN
      SELECT NEW.estado::text='Borrador' AND EXISTS(
        SELECT 1 FROM public.cotizacion_revisiones_fiscales
        WHERE cotizacion_id=OLD.id AND transaccion=txid_current()
          AND estado_anterior=OLD.estado::text AND snapshot_anterior=OLD.evaluacion_fiscal
      ) INTO v_revision;
      IF NOT v_revision THEN
        IF (NEW.conceptos_venta,NEW.cliente_id,NEW.evaluacion_fiscal,NEW.moneda,NEW.tipo_cambio_usd)
          IS DISTINCT FROM (OLD.conceptos_venta,OLD.cliente_id,OLD.evaluacion_fiscal,OLD.moneda,OLD.tipo_cambio_usd)
          OR NEW.estado::text IN ('Borrador','Solicitada') THEN
          RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
        END IF;
        -- Sending, acceptance and shipment linkage must still agree with the approved issuer/receptor.
        IF NEW.estado::text IN ('Enviada','Aceptada','En operación') AND
          (NEW.estado,NEW.embarque_id) IS DISTINCT FROM (OLD.estado,OLD.embarque_id) THEN
          v_resultado:=public._evaluar_documento_isr_resico(NEW.organization_id,NEW.cliente_id,NEW.conceptos_venta);
          IF v_old_eval->>'estado'<>'confirmado' OR v_resultado->'conceptos' IS DISTINCT FROM NEW.conceptos_venta THEN
            RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
          END IF;
        END IF;
        RETURN NEW;
      END IF;
    END IF;
  END IF;
  -- Never enrol an already sent legacy quote by a housekeeping update.
  IF v_old_eval IS NULL AND (NEW.estado::text NOT IN ('Borrador','Solicitada') AND
      (TG_OP='INSERT' OR OLD.estado::text NOT IN ('Borrador','Solicitada'))) THEN RETURN NEW; END IF;
  IF NEW.evaluacion_fiscal IS NULL AND NOT public._isr_documento_habilitado(NEW.organization_id) THEN
    IF jsonb_typeof(NEW.conceptos_venta)='array' AND EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.conceptos_venta) l
      WHERE l ?| ARRAY['evaluacion_fiscal','tasa_ret_isr','monto_ret_isr']) THEN
      RAISE EXCEPTION 'LC_ISR_EVALUACION_REQUERIDA' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.embarque_id IS NOT NULL THEN RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(NEW.conceptos_venta) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'LC_ISR_IMPORTES_INVALIDOS' USING ERRCODE='22023';
  END IF;
  SELECT COALESCE(jsonb_agg(CASE WHEN NULLIF(l->>'id','') IS NULL THEN l||jsonb_build_object('id',gen_random_uuid()) ELSE l END ORDER BY n),'[]')
    INTO v_lineas FROM jsonb_array_elements(NEW.conceptos_venta) WITH ORDINALITY a(l,n);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_lineas) l GROUP BY l->>'id' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'LC_ISR_LINAJE_INVALIDO' USING ERRCODE='23514';
  END IF;
  v_resultado:=public._evaluar_documento_isr_resico(NEW.organization_id,NEW.cliente_id,v_lineas);
  NEW.conceptos_venta:=v_resultado->'conceptos'; NEW.evaluacion_fiscal:=v_resultado->'snapshot';
  IF TG_OP='UPDATE' AND OLD.autorizada_at IS NOT NULL AND
    (OLD.evaluacion_fiscal IS DISTINCT FROM NEW.evaluacion_fiscal OR OLD.cliente_id IS DISTINCT FROM NEW.cliente_id) THEN
    IF NEW.estado::text IN ('Enviada','Aceptada') THEN RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514'; END IF;
    NEW.autorizada_at:=NULL; NEW.autorizada_por:=NULL; NEW.margen_autorizado_pct:=NULL;
    NEW.autorizacion_motivo:=NULL; NEW.autorizacion_solicitada_at:=NULL;
  END IF;
  IF NEW.estado::text IN ('Enviada','Aceptada') AND NEW.evaluacion_fiscal->>'estado'<>'confirmado' THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._isr_guard_concepto() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_cliente uuid; v_eval jsonb; v_parent_org uuid; v_opt_in boolean; v_ambiente text; v_origen jsonb; v_cot public.cotizaciones;
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
  IF TG_OP = 'UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL AND (
    (to_jsonb(NEW)->'organization_id',to_jsonb(NEW)->'embarque_id',to_jsonb(NEW)->'proforma_id',to_jsonb(NEW)->'deleted_at')
      IS DISTINCT FROM
    (to_jsonb(OLD)->'organization_id',to_jsonb(OLD)->'embarque_id',to_jsonb(OLD)->'proforma_id',to_jsonb(OLD)->'deleted_at')
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
  IF TG_TABLE_NAME='conceptos_venta' AND TG_OP='UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL THEN
    IF (NEW.cantidad, NEW.precio_unitario, NEW.moneda, NEW.tipo_iva, NEW.tasa_iva_aplicada, NEW.aplica_iva)
      IS NOT DISTINCT FROM
       (OLD.cantidad, OLD.precio_unitario, OLD.moneda, OLD.tipo_iva, OLD.tasa_iva_aplicada, OLD.aplica_iva) THEN
      NEW.evaluacion_fiscal := OLD.evaluacion_fiscal;
      NEW.tasa_ret_isr := OLD.tasa_ret_isr;
      NEW.monto_ret_isr := OLD.monto_ret_isr;
      RETURN NEW;
    END IF;
    IF OLD.cotizacion_concepto_origen_id IS NOT NULL THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE = '23514';
    END IF;
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

-- Fuente canónica de public._crear_embarque_replicar_conceptos
-- Helper privado (Bloque 3.2 · god-function split) usado por
-- crear_embarque_borrador_core para replicar cotizacion_costos y
-- conceptos_venta en el embarque recién creado.
-- Regenerada 1:1 desde la definición vigente (migración 20260912000100:
-- prorrateo por resto mayor, sin importes negativos).
-- v13.823.357 · Auditoría YAGNI P1 #2 y P2 #6/#7:
--   #2 Idempotencia POR CONJUNTO: si un intento previo dejó sólo costos o sólo
--      ventas, el reintento completa el conjunto faltante.
--   #6 Cantidad/precio no positivos se rechazan (antes cantidad 0 pasaba a 1).
--   #7 Moneda distinta de MXN/USD se rechaza (antes caía a MXN en silencio).
-- B19 (v13.823.379): la tasa de IVA de cada línea sigue la regla canónica del
--   cliente (`resolverTasaConcepto`): tasa explícita manda, `aplica_iva = true`
--   sin tasa usa la tasa general 0.16 y `aplica_iva = false` queda en 0.
-- Ver supabase/schema/README.md.

CREATE OR REPLACE FUNCTION public._crear_embarque_replicar_conceptos(p_cotizacion_id uuid, p_embarque_id uuid, p_org uuid, p_target_ids uuid[], p_conceptos_venta jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_costo public.cotizacion_costos%ROWTYPE;
  v_cid   uuid;
  v_venta jsonb;
  v_cant  numeric;
  v_total numeric;
  v_pu    numeric;
  v_tasa  numeric;
  v_tasa_json numeric;
  v_aplica boolean;
  v_base  numeric;
  v_n     integer;
  v_parte numeric;
  v_cent  bigint;
  v_piso  bigint;
  v_resto bigint;
  v_signo integer;
  v_i     integer;
  v_prov_nombre text;
  v_prov_id uuid;
  v_moneda text;
  v_tiene_costos boolean;
  v_tiene_ventas boolean;
BEGIN
  -- Idempotencia POR CONJUNTO: un reintento tras una falla parcial completa
  -- sólo el conjunto que falta (antes cualquiera de los dos abortaba todo).
  v_tiene_costos := EXISTS (
    SELECT 1 FROM public.conceptos_costo
    WHERE embarque_id = p_embarque_id AND deleted_at IS NULL
  );
  v_tiene_ventas := EXISTS (
    SELECT 1 FROM public.conceptos_venta
    WHERE embarque_id = p_embarque_id AND deleted_at IS NULL
  );
  IF v_tiene_costos AND v_tiene_ventas THEN
    RETURN;
  END IF;

  v_n := COALESCE(array_length(p_target_ids, 1), 0);

  IF NOT v_tiene_costos THEN
  FOR v_costo IN
    SELECT * FROM public.cotizacion_costos
    WHERE cotizacion_id = p_cotizacion_id AND deleted_at IS NULL
  LOOP
    v_moneda := upper(btrim(COALESCE(v_costo.moneda, 'MXN')));
    IF v_moneda NOT IN ('MXN', 'USD') THEN
      RAISE EXCEPTION 'LC_COT_MONEDA_NO_SOPORTADA: el costo "%" está en % y sólo MXN y USD están habilitados', v_costo.concepto, v_moneda
        USING ERRCODE = 'P0001';
    END IF;
    v_base := ROUND(COALESCE(v_costo.costo_total, v_costo.costo_unitario * v_costo.cantidad, 0), 2);
    v_prov_nombre := COALESCE(btrim(v_costo.proveedor), '');
    v_prov_id := public._resolver_proveedor_por_nombre(p_org, v_prov_nombre);
    IF v_prov_id IS NULL AND v_prov_nombre <> '' THEN
      SELECT a.proveedor_id INTO v_prov_id
        FROM public.proveedor_alias a
       WHERE a.organization_id = p_org
         AND upper(btrim(a.alias_normalizado)) = upper(v_prov_nombre)
       LIMIT 1;
    END IF;

    IF COALESCE(v_costo.unidad_medida, 'Contenedor') = 'BL' OR v_n = 0 THEN
      INSERT INTO public.conceptos_costo (embarque_id, contenedor_id, concepto, monto, moneda, proveedor_nombre, proveedor_id, organization_id, origen, cotizacion_costo_origen_id)
      VALUES (p_embarque_id, NULL, v_costo.concepto, v_base,
              CASE WHEN v_moneda = 'USD' THEN 'USD'::moneda ELSE 'MXN'::moneda END,
              v_prov_nombre, v_prov_id, p_org, 'cotizacion', v_costo.id);
    ELSE
      -- Prorrateo sin importes negativos (método del resto mayor en centavos):
      -- el piso se reparte a todos y los primeros `v_resto` contenedores
      -- reciben un centavo extra. La suma cuadra exacta y ninguna parte queda
      -- con signo contrario al total (antes 0.02 entre 4 daba 0.01/0.01/0.01/-0.01).
      v_signo := CASE WHEN v_base < 0 THEN -1 ELSE 1 END;
      v_cent  := ROUND(ABS(v_base) * 100)::bigint;
      v_piso  := v_cent / v_n::bigint;
      v_resto := v_cent - v_piso * v_n::bigint;
      v_i     := 0;
      FOREACH v_cid IN ARRAY p_target_ids LOOP
        v_i := v_i + 1;
        v_parte := ROUND(v_signo * (v_piso + CASE WHEN v_i <= v_resto THEN 1 ELSE 0 END)::numeric / 100, 2);
        INSERT INTO public.conceptos_costo (embarque_id, contenedor_id, concepto, monto, moneda, proveedor_nombre, proveedor_id, organization_id, origen, cotizacion_costo_origen_id)
        VALUES (p_embarque_id, v_cid, v_costo.concepto, v_parte,
                CASE WHEN v_moneda = 'USD' THEN 'USD'::moneda ELSE 'MXN'::moneda END,
                v_prov_nombre, v_prov_id, p_org, 'cotizacion', v_costo.id);
      END LOOP;
    END IF;
  END LOOP;
  END IF;

  IF NOT v_tiene_ventas AND jsonb_typeof(p_conceptos_venta) = 'array' THEN
    FOR v_venta IN SELECT * FROM jsonb_array_elements(p_conceptos_venta) LOOP
      IF COALESCE(trim(v_venta->>'descripcion'), '') <> '' THEN
        v_moneda := upper(btrim(COALESCE(v_venta->>'moneda', 'MXN')));
        IF v_moneda NOT IN ('MXN', 'USD') THEN
          RAISE EXCEPTION 'LC_COT_MONEDA_NO_SOPORTADA: el concepto de venta "%" está en % y sólo MXN y USD están habilitados', v_venta->>'descripcion', v_moneda
            USING ERRCODE = 'P0001';
        END IF;
        -- Cantidad ausente = 1 (renglón legacy); cantidad 0 o negativa se
        -- rechaza en lugar de reescribirse a 1 en silencio.
        v_cant := COALESCE(NULLIF(v_venta->>'cantidad', '')::numeric, 1);
        v_pu   := COALESCE(NULLIF(v_venta->>'precio_unitario', '')::numeric, 0);
        -- B19: misma regla canónica que el cliente (`resolverTasaConcepto`):
        --   1) tasa explícita (incluye 0) manda;
        --   2) sin tasa y aplica_iva = true ⇒ tasa general 0.16 (la misma
        --      constante que usa la conversión proforma → factura);
        --   3) aplica_iva = false ⇒ tasa 0 (la columna es NOT NULL).
        -- Antes una línea legacy con aplica_iva = true y sin tasa se replicaba
        -- con tasa 0 y el embarque perdía el IVA que mostraba la cotización.
        v_tasa_json := NULLIF(v_venta->>'tasa_iva_aplicada', '')::numeric;
        v_aplica := COALESCE((v_venta->>'aplica_iva')::boolean, COALESCE(v_tasa_json, 0) > 0);
        IF NOT v_aplica THEN
          v_tasa := 0;
        ELSIF v_tasa_json IS NOT NULL THEN
          v_tasa := GREATEST(v_tasa_json, 0);
        ELSE
          v_tasa := 0.16;
        END IF;

        -- C-1: la base gravable se DERIVA del unitario capturado. Fallback sólo
        -- si no hay unitario: se desinfla el `total` (que viene con IVA).
        IF v_pu = 0 AND v_cant > 0 THEN
          v_total := ROUND(COALESCE((v_venta->>'total')::numeric, 0) / (1 + v_tasa), 2);
          v_pu    := ROUND(v_total / v_cant, 6);
        END IF;

        IF v_cant <= 0 OR v_pu <= 0 THEN
          RAISE EXCEPTION 'LC_COT_VENTA_IMPORTE_INVALIDO: el concepto de venta "%" tiene cantidad o precio menor o igual a cero', v_venta->>'descripcion'
            USING ERRCODE = 'P0001';
        END IF;

        v_total := ROUND(v_cant * v_pu, 2);

        INSERT INTO public.conceptos_venta (
          embarque_id, descripcion, cantidad, precio_unitario, moneda,
          aplica_iva, tasa_iva_aplicada, total, organization_id, tipo_iva, origen, cotizacion_concepto_origen_id, evaluacion_fiscal
        )
        VALUES (
          p_embarque_id, v_venta->>'descripcion', v_cant, v_pu,
          CASE WHEN v_moneda = 'USD' THEN 'USD'::moneda ELSE 'MXN'::moneda END,
          v_aplica,
          v_tasa,
          v_total, p_org, v_venta->>'tipo_iva',
          CASE WHEN v_venta->'evaluacion_fiscal' IS NOT NULL THEN 'cotizacion' ELSE 'manual' END,
          CASE WHEN v_venta->'evaluacion_fiscal' IS NOT NULL THEN v_venta->>'id' END, v_venta->'evaluacion_fiscal'
        );
      END IF;
    END LOOP;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public._crear_embarque_replicar_conceptos(uuid, uuid, uuid, uuid[], jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._crear_embarque_replicar_conceptos(uuid, uuid, uuid, uuid[], jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_estado_cotizacion() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_old text := OLD.estado::text;
  v_new text := NEW.estado::text;
BEGIN
  IF v_old IS NULL OR v_new IS NULL OR v_old = v_new THEN
    RETURN NEW;
  END IF;
  IF v_new='Borrador' AND OLD.evaluacion_fiscal IS NOT NULL
    AND EXISTS(SELECT 1 FROM public.cotizacion_revisiones_fiscales
      WHERE cotizacion_id=OLD.id AND transaccion=txid_current()
        AND estado_anterior=v_old AND snapshot_anterior=OLD.evaluacion_fiscal) THEN RETURN NEW; END IF;
  -- Vencida siempre puede aplicarse desde cualquier estado no terminal
  IF v_new = 'Vencida' AND v_old IN ('Solicitada','Borrador','Enviada','Aceptada') THEN
    RETURN NEW;
  END IF;
  -- Housekeeping: Vencida >90 días → Archivada (C5)
  IF v_old = 'Vencida' AND v_new = 'Archivada' THEN
    RETURN NEW;
  END IF;
  -- Reactivación manual desde estados de housekeeping (A3).
  -- RG11: 'Aceptada' fuera de la lista (requiere snapshot del flujo normal).
  IF v_old IN ('Vencida','Archivada')
     AND v_new IN ('Solicitada','Borrador','Enviada') THEN
    RETURN NEW;
  END IF;
  -- Transiciones válidas
  IF (v_old = 'Solicitada'    AND v_new IN ('Borrador','Enviada','Aceptada','Rechazada'))
  OR (v_old = 'Borrador'      AND v_new IN ('Enviada','Aceptada','Rechazada'))
  OR (v_old = 'Enviada'       AND v_new IN ('Aceptada','Rechazada'))
  OR (v_old = 'Aceptada'      AND v_new IN ('En operación'))
  THEN
    RETURN NEW;
  END IF;
  -- FIX4 N-1: la papelera de embarques (sync_cotizacion_embarque_link)
  -- revierte 'En operación' → 'Aceptada' al liberar la cotización. Es la
  -- única transición admitida bajo la GUC transaccional
  -- app.liberando_papelera; sin ella, LC_COT_TRANSICION_INVALIDA.
  IF v_old = 'En operación' AND v_new = 'Aceptada'
     AND current_setting('app.liberando_papelera', true) = 'on' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'LC_COT_TRANSICION_INVALIDA: no se puede pasar de % a %', v_old, v_new
    USING ERRCODE = 'P0001';
END;
$$;

-- Espejo R4: borrador explícito y snapshot comercial, sin backfill histórico.
CREATE OR REPLACE FUNCTION public.crear_embarque_completo(p_embarque jsonb, p_conceptos_venta jsonb DEFAULT '[]'::jsonb, p_conceptos_costo jsonb DEFAULT '[]'::jsonb, p_documentos jsonb DEFAULT '[]'::jsonb, p_request_id uuid DEFAULT NULL::uuid, p_contenedores jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  nuevo_id uuid := gen_random_uuid();
  v_org_id uuid; v_resp jsonb;
  v_cot_id uuid;
  v_cot public.cotizaciones;
  v_aprobada jsonb;
  cv jsonb; cc jsonb; doc jsonb; ct jsonb;
BEGIN
  PERFORM public._assert_medidas_embarque(p_embarque);
  v_org_id := current_user_org_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'No organization context for caller'; END IF;
  PERFORM public._assert_writer(v_org_id);
  v_cot_id := NULLIF(p_embarque->>'cotizacion_id','')::uuid;
  PERFORM public._assert_relaciones_embarque(
    v_org_id,
    NULLIF(p_embarque->>'cliente_id','')::uuid,
    v_cot_id,
    p_conceptos_costo
  );
  v_resp := public.idempotency_claim(p_request_id, 'crear_embarque_completo');
  IF v_resp IS NOT NULL THEN RETURN v_resp; END IF;
  PERFORM public._assert_cotizacion_convertible(v_cot_id, v_org_id);
  SELECT * INTO v_cot FROM public.cotizaciones WHERE id = v_cot_id;
  IF v_cot.evaluacion_fiscal IS NOT NULL THEN
    -- El alta por formulario debe copiar la misma venta que la conversión.
    IF v_cot.evaluacion_fiscal->>'estado' IS DISTINCT FROM 'confirmado'
      OR v_cot.cliente_id IS DISTINCT FROM NULLIF(p_embarque->>'cliente_id','')::uuid
      OR (public._evaluar_documento_isr_resico(v_org_id, v_cot.cliente_id, v_cot.conceptos_venta)->'conceptos')
        IS DISTINCT FROM v_cot.conceptos_venta THEN
      RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE = '23514';
    END IF;
    IF jsonb_typeof(p_conceptos_venta) IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_conceptos_venta) <> jsonb_array_length(v_cot.conceptos_venta)
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_conceptos_venta) c
        GROUP BY c->>'cotizacion_concepto_origen_id' HAVING count(*) > 1
      ) THEN
      RAISE EXCEPTION 'LC_ISR_LINAJE_INVALIDO' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NULLIF(p_embarque->>'tarifa_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.costeo_tarifas t
    WHERE t.id = (p_embarque->>'tarifa_id')::uuid AND t.organization_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'LC_EMBARQUE_TARIFA_INVALIDA: la tarifa no pertenece a tu organización'
      USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO embarques (
    id, expediente, estado, cliente_id, cliente_nombre, modo, tipo,
    shipper, consignatario, incoterm, descripcion_mercancia,
    peso_kg, volumen_m3, piezas,
    puerto_origen, puerto_destino, naviera, agente, naviera_id, agente_id,
    bl_master, bl_house, tipo_servicio, contenedor, tipo_contenedor,
    aeropuerto_origen, aeropuerto_destino, aerolinea,
    mawb, hawb, ciudad_origen, ciudad_destino,
    transportista, carta_porte, etd, eta,
    tipo_cambio_usd, tipo_cambio_eur,
    tipo_carga, msds_archivo, operador, organization_id, cotizacion_id,
    tarifa_id, carta_garantia, dias_libres_destino, dias_almacenaje,
    seguro, valor_seguro_usd, notas
  ) VALUES (
    nuevo_id, NULLIF(p_embarque->>'expediente', ''), 'Borrador'::estado_embarque, (p_embarque->>'cliente_id')::uuid,
    COALESCE(p_embarque->>'cliente_nombre',''),
    (p_embarque->>'modo')::modo_transporte, (p_embarque->>'tipo')::tipo_operacion,
    COALESCE(p_embarque->>'shipper',''), COALESCE(p_embarque->>'consignatario',''),
    COALESCE((p_embarque->>'incoterm')::incoterm,'FOB'),
    COALESCE(p_embarque->>'descripcion_mercancia',''),
    COALESCE((p_embarque->>'peso_kg')::numeric,0),
    COALESCE((p_embarque->>'volumen_m3')::numeric,0),
    COALESCE((p_embarque->>'piezas')::int,0),
    p_embarque->>'puerto_origen', p_embarque->>'puerto_destino',
    p_embarque->>'naviera', p_embarque->>'agente',
    NULLIF(p_embarque->>'naviera_id','')::uuid, NULLIF(p_embarque->>'agente_id','')::uuid,
    p_embarque->>'bl_master', p_embarque->>'bl_house',
    CASE WHEN p_embarque->>'tipo_servicio' IS NOT NULL THEN (p_embarque->>'tipo_servicio')::tipo_servicio_maritimo END,
    p_embarque->>'contenedor', p_embarque->>'tipo_contenedor',
    p_embarque->>'aeropuerto_origen', p_embarque->>'aeropuerto_destino',
    p_embarque->>'aerolinea', p_embarque->>'mawb', p_embarque->>'hawb',
    p_embarque->>'ciudad_origen', p_embarque->>'ciudad_destino',
    p_embarque->>'transportista', p_embarque->>'carta_porte',
    CASE WHEN p_embarque->>'etd' IS NOT NULL THEN (p_embarque->>'etd')::date END,
    CASE WHEN p_embarque->>'eta' IS NOT NULL THEN (p_embarque->>'eta')::date END,
    NULLIF(NULLIF(p_embarque->>'tipo_cambio_usd','')::numeric, 0),
    NULLIF(NULLIF(p_embarque->>'tipo_cambio_eur','')::numeric, 0),
    COALESCE(p_embarque->>'tipo_carga','Carga General'),
    p_embarque->>'msds_archivo', COALESCE(p_embarque->>'operador',''),
    v_org_id,
    v_cot_id,
    NULLIF(p_embarque->>'tarifa_id', '')::uuid,
    COALESCE((p_embarque->>'carta_garantia')::boolean, false),
    COALESCE((p_embarque->>'dias_libres_destino')::integer, 0),
    COALESCE((p_embarque->>'dias_almacenaje')::integer, 0),
    COALESCE((p_embarque->>'seguro')::boolean, false),
    NULLIF(p_embarque->>'valor_seguro_usd', '')::numeric,
    NULLIF(p_embarque->>'notas', '')
  );
  FOR cv IN SELECT * FROM jsonb_array_elements(p_conceptos_venta) LOOP
    IF COALESCE((cv->>'tasa_ret_iva')::numeric, 0) <> 0 THEN
      RAISE EXCEPTION 'LC_ISR_RETENCION_NO_SOPORTADA' USING ERRCODE = '22023';
    END IF;
    IF v_cot.evaluacion_fiscal IS NOT NULL THEN
      SELECT c INTO v_aprobada FROM jsonb_array_elements(v_cot.conceptos_venta) c
        WHERE c->>'id' = cv->>'cotizacion_concepto_origen_id';
      IF v_aprobada IS NULL
        OR (cv->>'descripcion', (cv->>'cantidad')::numeric, (cv->>'precio_unitario')::numeric,
            cv->>'moneda', NULLIF(cv->>'tipo_iva', ''))
          IS DISTINCT FROM
           (v_aprobada->>'descripcion', (v_aprobada->>'cantidad')::numeric,
            (v_aprobada->>'precio_unitario')::numeric, v_aprobada->>'moneda', v_aprobada->>'tipo_iva') THEN
        RAISE EXCEPTION 'LC_ISR_LINAJE_INVALIDO' USING ERRCODE = '23514';
      END IF;
      cv := v_aprobada || jsonb_build_object(
        'total', round((v_aprobada->>'cantidad')::numeric * (v_aprobada->>'precio_unitario')::numeric, 2)
      );
    END IF;
    INSERT INTO conceptos_venta (embarque_id, descripcion, cantidad, precio_unitario, moneda, total,
                                 aplica_iva, tasa_iva_aplicada, tipo_iva, organization_id,
                                 evaluacion_fiscal, origen, cotizacion_concepto_origen_id)
    VALUES (nuevo_id, cv->>'descripcion', (cv->>'cantidad')::numeric, (cv->>'precio_unitario')::numeric,
            (cv->>'moneda')::moneda, (cv->>'total')::numeric,
            COALESCE((cv->>'aplica_iva')::boolean, false),
            COALESCE((cv->>'tasa_iva_aplicada')::numeric, 0.16),
            NULLIF(cv->>'tipo_iva', ''),
            v_org_id, v_aprobada->'evaluacion_fiscal',
            CASE WHEN v_aprobada IS NOT NULL THEN 'cotizacion' ELSE 'manual' END,
            v_aprobada->>'id');
  END LOOP;
  FOR cc IN SELECT * FROM jsonb_array_elements(p_conceptos_costo) LOOP
    INSERT INTO conceptos_costo (embarque_id, concepto, proveedor_nombre, proveedor_id, moneda, monto, organization_id)
    VALUES (nuevo_id, cc->>'concepto', COALESCE(cc->>'proveedor_nombre',''),
      CASE WHEN cc->>'proveedor_id' IS NOT NULL AND cc->>'proveedor_id' <> '' THEN (cc->>'proveedor_id')::uuid END,
      (cc->>'moneda')::moneda, (cc->>'monto')::numeric, v_org_id);
  END LOOP;
  FOR doc IN SELECT * FROM jsonb_array_elements(p_documentos) LOOP
    INSERT INTO documentos_embarque (embarque_id, nombre, archivo, estado, organization_id)
    VALUES (nuevo_id, doc->>'nombre', NULLIF(doc->>'archivo',''),
      CASE WHEN NULLIF(doc->>'archivo','') IS NOT NULL THEN 'Recibido'::estado_documento ELSE 'Pendiente'::estado_documento END,
      v_org_id);
  END LOOP;
  FOR ct IN SELECT * FROM jsonb_array_elements(COALESCE(p_contenedores, '[]'::jsonb)) LOOP
    INSERT INTO embarque_contenedores (
      embarque_id, numero_contenedor, tipo_contenedor, bl_house,
      peso_kg, volumen_m3, piezas, orden, organization_id
    ) VALUES (
      nuevo_id,
      COALESCE(ct->>'numero_contenedor',''),
      COALESCE(ct->>'tipo_contenedor',''),
      NULLIF(ct->>'bl_house',''),
      COALESCE(NULLIF(ct->>'peso_kg','')::numeric, 0),
      COALESCE(NULLIF(ct->>'volumen_m3','')::numeric, 0),
      COALESCE(NULLIF(ct->>'piezas','')::int, 0),
      COALESCE(NULLIF(ct->>'orden','')::int, 1),
      v_org_id
    );
  END LOOP;
  INSERT INTO notas_embarque (embarque_id, contenido, tipo, organization_id)
  VALUES (nuevo_id, 'Embarque creado', 'sistema', v_org_id);
  v_resp := jsonb_build_object('id', nuevo_id);
  PERFORM public.idempotency_store(p_request_id, v_resp);
  RETURN v_resp;
END;
$function$;
REVOKE ALL ON FUNCTION public.crear_embarque_completo(jsonb, jsonb, jsonb, jsonb, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_embarque_completo(jsonb, jsonb, jsonb, jsonb, uuid, jsonb) TO authenticated, service_role;

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
  v_cliente_actual uuid;
BEGIN
  SELECT organization_id, updated_at, cliente_id
    INTO v_org_id, v_current_updated_at, v_cliente_actual
    FROM embarques
   WHERE id = p_embarque_id
   FOR UPDATE;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Embarque no encontrado'; END IF;
  PERFORM public._assert_writer(v_org_id);
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
    COALESCE(NULLIF(p_embarque->>'cliente_id','')::uuid, v_cliente_actual),
    NULLIF(p_embarque->>'cotizacion_id','')::uuid,
    p_conceptos_costo
  );
  v_resp := public.idempotency_claim(p_request_id, 'actualizar_embarque_completo');
  IF v_resp IS NOT NULL THEN RETURN v_resp; END IF;
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

REVOKE ALL ON FUNCTION public._isr_documento_habilitado(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._isr_snapshot_documento(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._evaluar_documento_isr_resico(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._isr_guard_cotizacion() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._isr_guard_concepto() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.evaluar_documento_isr_resico(uuid,uuid,jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.obtener_evaluacion_fiscal_embarque(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.revisar_cotizacion_fiscal(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.validar_cotizacion_fiscal_envio(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.evaluar_documento_isr_resico(uuid,uuid,jsonb,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.obtener_evaluacion_fiscal_embarque(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revisar_cotizacion_fiscal(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validar_cotizacion_fiscal_envio(uuid,text,uuid) TO service_role;

-- Etapa 2: contrato opt-in. NULL identifica legado; no backfill ni activacion fiscal.
ALTER TABLE public.conceptos_venta
  ADD COLUMN tasa_ret_isr numeric,
  ADD COLUMN monto_ret_isr numeric,
  ADD COLUMN evaluacion_fiscal jsonb;
ALTER TABLE public.proforma_conceptos_consolidados
  ADD COLUMN tasa_ret_isr numeric,
  ADD COLUMN monto_ret_isr numeric,
  ADD COLUMN evaluacion_fiscal jsonb;
ALTER TABLE public.cotizaciones ADD COLUMN evaluacion_fiscal jsonb;

CREATE OR REPLACE FUNCTION public._evaluar_isr_resico(
  p_org_id uuid, p_cliente_id uuid, p_ambiente text,
  p_cantidad numeric, p_precio_unitario numeric, p_tipo_iva text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_perfil public.perfiles_fiscales_emisor;
  v_cred public.facturapi_credenciales;
  v_cliente public.clientes;
  v_rfc_empresa text;
  v_perfil_estado jsonb;
  v_receptor text;
  v_estado text := 'pendiente';
  v_motivo text;
  v_tasa numeric;
  v_base numeric;
  v_fecha_rfc text;
  v_rfc_valido boolean := false;
BEGIN
  IF p_ambiente IS NULL OR p_ambiente NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION 'LC_ISR_AMBIENTE_INVALIDO' USING ERRCODE = '22023';
  END IF;
  IF p_cantidad IS NULL OR p_precio_unitario IS NULL
    OR p_cantidad::text IN ('NaN','Infinity','-Infinity')
    OR p_precio_unitario::text IN ('NaN','Infinity','-Infinity')
    OR p_cantidad <= 0 OR p_precio_unitario < 0
    OR scale(p_cantidad) > 6 OR scale(p_precio_unitario) > 6 THEN
    RAISE EXCEPTION 'LC_ISR_IMPORTES_INVALIDOS' USING ERRCODE = '22023';
  END IF;
  v_base := round(p_cantidad * p_precio_unitario, 2);
  SELECT * INTO v_cred FROM public.facturapi_credenciales WHERE organization_id = p_org_id;
  SELECT * INTO v_perfil FROM public.perfiles_fiscales_emisor
    WHERE organization_id = p_org_id AND ambiente = p_ambiente ORDER BY version DESC LIMIT 1;
  SELECT valor #>> '{}' INTO v_rfc_empresa FROM public.configuracion
    WHERE organization_id = p_org_id AND categoria = 'empresa' AND clave = 'rfc';
  SELECT * INTO v_cliente FROM public.clientes
    WHERE id = p_cliente_id AND organization_id = p_org_id AND deleted_at IS NULL;
  v_perfil_estado := public._perfil_fiscal_emisor_resultado(v_perfil, v_cred, v_rfc_empresa);
  v_receptor := upper(btrim(v_cliente.rfc));
  IF v_receptor ~ '^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$' THEN
    v_fecha_rfc := substring(v_receptor FROM length(v_receptor)-8 FOR 6);
    BEGIN
      PERFORM make_date(2000+substring(v_fecha_rfc FROM 1 FOR 2)::integer,
        substring(v_fecha_rfc FROM 3 FOR 2)::integer,substring(v_fecha_rfc FROM 5 FOR 2)::integer);
      v_rfc_valido := true;
    EXCEPTION WHEN datetime_field_overflow THEN v_rfc_valido := false;
    END;
  END IF;
  IF v_cred.ambiente IS DISTINCT FROM p_ambiente THEN
    v_motivo := 'ambiente_discordante';
  ELSIF v_perfil_estado->>'estado' IS DISTINCT FROM 'confirmado' THEN
    v_motivo := 'perfil_no_confirmado';
  ELSIF v_cliente.id IS NULL THEN
    v_motivo := 'receptor_no_identificado';
  ELSIF v_receptor IN ('XAXX010101000','XEXX010101000') THEN
    v_motivo := 'receptor_generico_o_extranjero';
  ELSIF NOT v_rfc_valido THEN
    v_motivo := 'receptor_no_identificado';
  ELSIF v_perfil.tipo_persona = 'moral' OR v_perfil.regimen_fiscal <> '626' THEN
    v_estado := 'no_aplica'; v_tasa := 0; v_motivo := 'emisor_fuera_regla_resico';
  ELSIF length(v_receptor) = 13 THEN
    v_estado := 'no_aplica'; v_tasa := 0; v_motivo := 'receptor_persona_fisica';
  ELSIF v_perfil.vigente_desde IS NULL OR v_perfil.vigente_desde > public.fecha_negocio_mx() THEN
    v_motivo := 'vigencia_perfil_pendiente';
  ELSIF p_tipo_iva IS NULL OR p_tipo_iva NOT IN ('gravado_16','gravado_8','tasa_0','exento') THEN
    v_motivo := CASE WHEN p_tipo_iva = 'no_objeto' THEN 'conflicto_no_objeto' ELSE 'clasificacion_pendiente' END;
  ELSE
    v_estado := 'aplica'; v_tasa := 0.0125; v_motivo := 'pf_resico_receptor_moral';
  END IF;
  RETURN jsonb_build_object(
    'regla_version','resico_113j_v1','precision_version','base_exacta_impuesto_2_v1',
    'estado',v_estado,'motivo',v_motivo,'ambiente',p_ambiente,
    'base',v_base,'base_exacta',p_cantidad*p_precio_unitario,'tasa_ret_isr',v_tasa,
    'monto_ret_isr',round(p_cantidad*p_precio_unitario*v_tasa,2),
    'perfil_id',v_perfil.id,'perfil_version',v_perfil.version,
    'emisor',jsonb_build_object('rfc',v_perfil.rfc,'tipo_persona',v_perfil.tipo_persona,
      'regimen_fiscal',v_perfil.regimen_fiscal,'vigente_desde',v_perfil.vigente_desde),
    'receptor',jsonb_build_object('id',v_cliente.id,'rfc',v_receptor));
END;
$$;

CREATE OR REPLACE FUNCTION public.evaluar_isr_resico(
  p_org_id uuid, p_cliente_id uuid, p_ambiente text,
  p_cantidad numeric, p_precio_unitario numeric, p_tipo_iva text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF p_org_id IS DISTINCT FROM public.org_scope() OR NOT public.has_any_role_in_org_exact(
    auth.uid(), ARRAY['admin','admin_org','contador','auxiliar_contable','operador',
      'vendedor','gerente_comercial','gerente_operaciones','coordinador_logistico',
      'ejecutivo_pricing','customer_service','tesorero','ejecutivo_cobranza']::public.app_role[], p_org_id) THEN
    RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  RETURN public._evaluar_isr_resico(p_org_id,p_cliente_id,p_ambiente,p_cantidad,p_precio_unitario,p_tipo_iva)
    - 'emisor' - 'receptor';
END;
$$;

-- Row triggers also cover direct table writes and SECURITY DEFINER writers.
-- Existing RLS / parent guards remain responsible for authorization of the write.
CREATE OR REPLACE FUNCTION public._isr_guard_concepto() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_cliente uuid; v_eval jsonb; v_parent_org uuid; v_opt_in boolean;
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
  v_eval := public._evaluar_isr_resico(NEW.organization_id,v_cliente,NEW.evaluacion_fiscal->>'ambiente',
    NEW.cantidad,NEW.precio_unitario,NEW.tipo_iva);
  NEW.evaluacion_fiscal := v_eval;
  NEW.tasa_ret_isr := (v_eval->>'tasa_ret_isr')::numeric;
  NEW.monto_ret_isr := (v_eval->>'monto_ret_isr')::numeric;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_isr_contrato BEFORE INSERT OR UPDATE OR DELETE ON public.conceptos_venta
  FOR EACH ROW EXECUTE FUNCTION public._isr_guard_concepto();
CREATE TRIGGER zz_isr_contrato BEFORE INSERT OR UPDATE OR DELETE ON public.proforma_conceptos_consolidados
  FOR EACH ROW EXECUTE FUNCTION public._isr_guard_concepto();

CREATE OR REPLACE FUNCTION public._isr_guard_cotizacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_linea jsonb; v_eval jsonb; v_lineas jsonb := '[]'; v_ambiente text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.evaluacion_fiscal IS NOT NULL THEN RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL AND NEW.evaluacion_fiscal IS NULL THEN
    RAISE EXCEPTION 'LC_ISR_NO_DESACTIVAR' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND OLD.evaluacion_fiscal IS NOT NULL
    AND (NEW.organization_id,NEW.deleted_at) IS DISTINCT FROM (OLD.organization_id,OLD.deleted_at) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_REQUERIDA' USING ERRCODE='23514';
  END IF;
  IF NEW.evaluacion_fiscal IS NULL THEN
    IF jsonb_typeof(NEW.conceptos_venta) IS DISTINCT FROM 'array' THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.conceptos_venta) l
      WHERE l ?| ARRAY['evaluacion_fiscal','tasa_ret_isr','monto_ret_isr']) THEN
      RAISE EXCEPTION 'LC_ISR_EVALUACION_REQUERIDA' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW.conceptos_venta) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'LC_ISR_IMPORTES_INVALIDOS' USING ERRCODE='22023';
  END IF;
  IF NEW.estado::text NOT IN ('Borrador','Solicitada') OR NEW.embarque_id IS NOT NULL THEN
    RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514';
  END IF;
  v_ambiente := NEW.evaluacion_fiscal->>'ambiente';
  -- Document marker survives removal of all lines; opt-in cannot be erased.
  NEW.evaluacion_fiscal := jsonb_build_object('ambiente',v_ambiente,'regla_version','resico_113j_v1');
  FOR v_linea IN SELECT value FROM jsonb_array_elements(NEW.conceptos_venta) LOOP
    v_eval := public._evaluar_isr_resico(NEW.organization_id,NEW.cliente_id,v_ambiente,
      (v_linea->>'cantidad')::numeric,(v_linea->>'precio_unitario')::numeric,v_linea->>'tipo_iva');
    v_lineas := v_lineas || jsonb_build_array(v_linea || jsonb_build_object('evaluacion_fiscal',v_eval,
      'tasa_ret_isr',v_eval->'tasa_ret_isr','monto_ret_isr',v_eval->'monto_ret_isr'));
  END LOOP;
  IF v_ambiente IS NULL OR v_ambiente NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION 'LC_ISR_AMBIENTE_INVALIDO' USING ERRCODE='22023';
  END IF;
  NEW.conceptos_venta := v_lineas;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_isr_contrato BEFORE INSERT OR UPDATE OR DELETE ON public.cotizaciones
  FOR EACH ROW EXECUTE FUNCTION public._isr_guard_cotizacion();

CREATE OR REPLACE FUNCTION public._isr_guard_padre() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME='embarques' THEN
    IF (NEW.cliente_id,NEW.organization_id) IS DISTINCT FROM (OLD.cliente_id,OLD.organization_id)
      AND EXISTS (SELECT 1 FROM public.conceptos_venta WHERE embarque_id=OLD.id AND evaluacion_fiscal IS NOT NULL) THEN
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
CREATE TRIGGER zz_isr_padre BEFORE UPDATE ON public.embarques FOR EACH ROW EXECUTE FUNCTION public._isr_guard_padre();
CREATE TRIGGER zz_isr_padre BEFORE UPDATE ON public.proformas FOR EACH ROW EXECUTE FUNCTION public._isr_guard_padre();

-- A direct invoice-line write must not bypass the proforma parent transition.
CREATE OR REPLACE FUNCTION public._isr_guard_conversion_factura() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.proforma_id_origen IS NOT NULL THEN
    PERFORM 1 FROM public.proformas WHERE id=NEW.proforma_id_origen FOR NO KEY UPDATE;
  END IF;
  IF NEW.proforma_id_origen IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.proforma_conceptos_consolidados
    WHERE proforma_id=NEW.proforma_id_origen AND evaluacion_fiscal IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'LC_ISR_FLUJO_NO_HABILITADO' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER zz_isr_conversion BEFORE INSERT OR UPDATE ON public.conceptos_factura
  FOR EACH ROW EXECUTE FUNCTION public._isr_guard_conversion_factura();

REVOKE ALL ON FUNCTION public._evaluar_isr_resico(uuid,uuid,text,numeric,numeric,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._isr_guard_concepto(),public._isr_guard_cotizacion(),public._isr_guard_padre() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public._isr_guard_conversion_factura() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.evaluar_isr_resico(uuid,uuid,text,numeric,numeric,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.evaluar_isr_resico(uuid,uuid,text,numeric,numeric,text) TO authenticated;

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

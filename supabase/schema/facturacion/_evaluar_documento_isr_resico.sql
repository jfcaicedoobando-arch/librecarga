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

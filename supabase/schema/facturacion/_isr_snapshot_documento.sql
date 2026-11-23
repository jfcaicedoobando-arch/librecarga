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

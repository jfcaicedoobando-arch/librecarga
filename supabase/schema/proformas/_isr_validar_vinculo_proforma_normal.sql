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

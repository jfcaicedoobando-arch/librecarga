CREATE OR REPLACE FUNCTION public._isr_snapshot_proforma_normal(p_org_id uuid, p_embarque_id uuid,
  p_cliente_id uuid, p_concepto_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_lineas jsonb;
  v_ambiente text;
  v_vigente jsonb;
  v_conceptos jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) INTO v_lineas
  FROM public.conceptos_venta c
  WHERE c.id = ANY(p_concepto_ids) AND c.organization_id = p_org_id
    AND c.embarque_id = p_embarque_id AND c.deleted_at IS NULL;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_lineas) l WHERE l->'evaluacion_fiscal' <> 'null'::jsonb) THEN
    -- Un embarque evaluado no puede facturar por la vía histórica eligiendo sólo sus renglones legacy.
    IF EXISTS (SELECT 1 FROM public.conceptos_venta c WHERE c.embarque_id = p_embarque_id
      AND c.organization_id = p_org_id AND c.deleted_at IS NULL AND c.evaluacion_fiscal IS NOT NULL) THEN
      RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END IF;
  IF p_cliente_id IS NULL OR jsonb_array_length(v_lineas) <> cardinality(p_concepto_ids) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_lineas) l
    WHERE COALESCE(l->'evaluacion_fiscal'->>'estado', '') NOT IN ('aplica', 'no_aplica')
  ) THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  v_ambiente := v_lineas->0->'evaluacion_fiscal'->>'ambiente';
  v_vigente := public._evaluar_documento_isr_resico(p_org_id, p_cliente_id, v_lineas);
  IF v_vigente#>>'{snapshot,estado}' IS DISTINCT FROM 'confirmado' OR v_lineas IS DISTINCT FROM v_vigente->'conceptos' THEN
    RAISE EXCEPTION 'LC_ISR_PROFORMA_REVISION' USING ERRCODE = '23514';
  END IF;
  SELECT jsonb_agg(public._isr_concepto_proforma_normal(l) || jsonb_build_object('embarque_contenedores',
    CASE WHEN ec.id IS NOT NULL THEN jsonb_build_object('id', ec.id, 'numero_contenedor', ec.numero_contenedor,
      'tipo_contenedor', ec.tipo_contenedor) END) ORDER BY l->>'created_at', l->>'id') INTO v_conceptos
  FROM jsonb_array_elements(v_lineas) l
  LEFT JOIN public.embarque_contenedores ec ON ec.id = (l->>'contenedor_id')::uuid
    AND ec.embarque_id = p_embarque_id AND ec.organization_id = p_org_id AND ec.deleted_at IS NULL;
  RETURN public._isr_snapshot_documento(p_org_id, p_cliente_id, v_ambiente, v_conceptos)
    || jsonb_build_object('conceptos', v_conceptos);
END;
$$;

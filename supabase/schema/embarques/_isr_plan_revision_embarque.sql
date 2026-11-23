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

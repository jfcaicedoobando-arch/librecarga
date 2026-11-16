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

-- Verify the accepted capture against the current tenant identity and its locked source rows.
CREATE OR REPLACE FUNCTION public._isr_validar_conversion_proforma(p_proforma_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_proforma public.proformas;
  v_lineas jsonb;
  v_evaluacion jsonb;
  v_snapshot jsonb;
  v_regimen_receptor text;
BEGIN
  SELECT * INTO v_proforma FROM public.proformas p
  WHERE p.id = p_proforma_id AND p.organization_id = public.org_scope() FOR UPDATE;
  IF NOT FOUND OR NOT public.has_any_role_in_org_exact(auth.uid(),
    ARRAY['admin','admin_org','contador']::public.app_role[], v_proforma.organization_id) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF v_proforma.deleted_at IS NOT NULL OR v_proforma.estado_proforma NOT IN ('pendiente','aprobada')
    OR v_proforma.estado_cliente <> 'aceptada' OR v_proforma.consolidada_en IS NOT NULL
    OR v_proforma.factura_id IS NOT NULL OR v_proforma.factura_secundaria_id IS NOT NULL
    OR v_proforma.folio_factura_externa IS NOT NULL
    OR v_proforma.evaluacion_fiscal->>'estado' IS DISTINCT FROM 'confirmado'
    OR NOT public._isr_documento_habilitado(v_proforma.organization_id)
    OR jsonb_typeof(v_proforma.conceptos_fiscales) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_proforma.conceptos_fiscales) = 0
    OR (v_proforma.es_consolidada AND v_proforma.estado_revision <> 'aprobada')
    OR (v_proforma.es_consolidada AND v_proforma.ajuste_consolidacion_aprobado_at IS NULL
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_proforma.evaluacion_fiscal->'ajustes_consolidacion') a
        WHERE (a->>'diferencia')::numeric <> 0)) THEN
    RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
  END IF;

  PERFORM c.id FROM public.conceptos_venta c WHERE c.proforma_id = p_proforma_id
    AND c.organization_id = v_proforma.organization_id AND c.deleted_at IS NULL ORDER BY c.id FOR UPDATE;
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) INTO v_lineas
  FROM public.conceptos_venta c WHERE c.proforma_id = p_proforma_id AND c.organization_id = v_proforma.organization_id
    AND c.embarque_id = v_proforma.embarque_id AND c.estado_facturacion = 'en_proforma' AND c.deleted_at IS NULL;
  IF v_lineas IS NULL OR jsonb_array_length(v_lineas) <> jsonb_array_length(v_proforma.conceptos_fiscales)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_lineas) l WHERE
      (v_proforma.conceptos_fiscales @> jsonb_build_array(public._isr_concepto_proforma_normal(l))) IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
  END IF;

  -- Active sales retain the original issuer and recipient identity, including their RFCs.
  v_evaluacion := public._evaluar_documento_isr_resico(v_proforma.organization_id, v_proforma.cliente_id, v_lineas);
  v_snapshot := v_evaluacion->'snapshot';
  IF v_lineas IS DISTINCT FROM v_evaluacion->'conceptos' OR v_snapshot->>'estado' IS DISTINCT FROM 'confirmado'
    OR (v_snapshot->'ambiente', v_snapshot->'perfil_id', v_snapshot->'perfil_version', v_snapshot->'regla_version',
      v_snapshot->'precision_version', v_snapshot->'bloques') IS DISTINCT FROM
       (v_proforma.evaluacion_fiscal->'ambiente', v_proforma.evaluacion_fiscal->'perfil_id',
        v_proforma.evaluacion_fiscal->'perfil_version', v_proforma.evaluacion_fiscal->'regla_version',
        v_proforma.evaluacion_fiscal->'precision_version', v_proforma.evaluacion_fiscal->'bloques') THEN
    RAISE EXCEPTION 'LC_ISR_CONVERSION_REVISION' USING ERRCODE = '23514';
  END IF;
  SELECT c.regimen_fiscal INTO v_regimen_receptor FROM public.clientes c
    WHERE c.id = v_proforma.cliente_id AND c.organization_id = v_proforma.organization_id AND c.deleted_at IS NULL;
  RETURN v_proforma.evaluacion_fiscal || jsonb_build_object(
    'emisor', v_lineas#>'{0,evaluacion_fiscal,emisor}',
    'receptor', (v_lineas#>'{0,evaluacion_fiscal,receptor}') || jsonb_build_object('regimen_fiscal', v_regimen_receptor));
END;
$$;

CREATE OR REPLACE FUNCTION public.aprobar_ajuste_consolidacion_proforma(p_proforma_id uuid, p_huella text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_proforma public.proformas;
  v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_proforma FROM public.proformas WHERE id = p_proforma_id AND organization_id = public.org_scope() FOR UPDATE;
  IF NOT FOUND OR NOT public.has_any_role_in_org_exact(v_uid, ARRAY['admin','admin_org','contador']::public.app_role[], v_proforma.organization_id) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  IF NOT v_proforma.es_consolidada OR v_proforma.evaluacion_fiscal IS NULL OR v_proforma.deleted_at IS NOT NULL
    OR v_proforma.estado_proforma <> 'pendiente' OR v_proforma.estado_cliente = 'rechazada'
    OR v_proforma.evaluacion_fiscal->>'conceptos_fingerprint' IS DISTINCT FROM p_huella
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_proforma.evaluacion_fiscal->'ajustes_consolidacion') a
      WHERE (a->>'diferencia')::numeric <> 0) THEN
    RAISE EXCEPTION 'LC_ISR_CONSOLIDACION_APROBACION' USING ERRCODE = '23514';
  END IF;
  IF v_proforma.ajuste_consolidacion_aprobado_at IS NULL THEN
    UPDATE public.proformas SET estado_revision = 'aprobada', ajuste_consolidacion_aprobado_at = clock_timestamp(),
      ajuste_consolidacion_aprobado_por = v_uid WHERE id = p_proforma_id RETURNING * INTO v_proforma;
  END IF;
  RETURN jsonb_build_object('proforma_id', p_proforma_id, 'aprobada_at', v_proforma.ajuste_consolidacion_aprobado_at);
END;
$$;

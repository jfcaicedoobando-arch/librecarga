CREATE OR REPLACE FUNCTION public.preparar_revision_fiscal_embarque(p_embarque_id uuid, p_cliente_id uuid,
  p_conceptos_venta jsonb, p_expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_embarque public.embarques;
  v_plan jsonb;
BEGIN
  SELECT * INTO v_embarque FROM public.embarques WHERE id = p_embarque_id AND deleted_at IS NULL;
  IF v_embarque.id IS NULL OR v_embarque.organization_id IS DISTINCT FROM public.org_scope() THEN
    RAISE EXCEPTION 'LC_ISR_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  PERFORM public._assert_writer(v_embarque.organization_id);
  IF v_embarque.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'LC_CONFLICTO_CONCURRENCIA' USING ERRCODE = '40001';
  END IF;
  PERFORM public._assert_relaciones_embarque(v_embarque.organization_id,
    COALESCE(p_cliente_id, v_embarque.cliente_id), NULL, '[]');
  v_plan := public._isr_plan_revision_embarque(p_embarque_id, COALESCE(p_cliente_id, v_embarque.cliente_id), p_conceptos_venta);
  IF v_plan IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('antes', v_plan->'antes', 'despues', v_plan->'despues', 'huella', v_plan->'huella',
    'puede_autorizar', public.has_any_role_in_org_exact(auth.uid(), ARRAY['admin','admin_org','contador']::public.app_role[],
      v_embarque.organization_id));
END;
$$;

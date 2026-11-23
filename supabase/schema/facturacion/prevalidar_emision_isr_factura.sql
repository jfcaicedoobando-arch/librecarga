CREATE OR REPLACE FUNCTION public.prevalidar_emision_isr_factura(p_factura_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_org uuid := public.org_scope();
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR v_org IS NULL
    OR NOT public.has_any_role_efectivo(v_uid, ARRAY['admin','admin_org','contador','super_admin']::public.app_role[])
    OR NOT EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = p_factura_id
      AND f.organization_id = v_org AND f.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'LC_ISR_REVISION_SIN_PERMISO' USING ERRCODE = '42501';
  END IF;
  RETURN public._isr_revisar_factura_emision(p_factura_id);
END;
$$;
REVOKE ALL ON FUNCTION public.prevalidar_emision_isr_factura(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.prevalidar_emision_isr_factura(uuid) TO authenticated;

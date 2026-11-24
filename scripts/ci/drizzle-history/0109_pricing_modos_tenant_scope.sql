-- Match the tenant boundary required for business tables with organization_id.
DROP POLICY IF EXISTS crm_pricing_modos_ejecutivo_tenant_restrictive ON public.crm_pricing_modos_ejecutivo;
CREATE POLICY crm_pricing_modos_ejecutivo_tenant_restrictive ON public.crm_pricing_modos_ejecutivo
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id))
  WITH CHECK ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id));

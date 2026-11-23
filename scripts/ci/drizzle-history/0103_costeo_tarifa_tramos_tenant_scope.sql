-- Conserva la membresía de las políticas permisivas y exige el tenant activo al super_admin.
DROP POLICY IF EXISTS costeo_tarifa_tramos_tenant_restrictive ON public.costeo_tarifa_tramos;
CREATE POLICY costeo_tarifa_tramos_tenant_restrictive ON public.costeo_tarifa_tramos
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id))
  WITH CHECK ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id));

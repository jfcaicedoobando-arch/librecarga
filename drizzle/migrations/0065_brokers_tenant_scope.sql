-- Forward-only Ola16 boundary for broker business tables.
-- Restrict super_admin to the active tenant; preserve ordinary broker access and existing permissive policies.
DROP POLICY IF EXISTS crm_brokers_tenant_restrictive ON public.crm_brokers;
CREATE POLICY crm_brokers_tenant_restrictive ON public.crm_brokers
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id))
  WITH CHECK ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id));

DROP POLICY IF EXISTS crm_broker_solicitudes_tenant_restrictive ON public.crm_broker_solicitudes;
CREATE POLICY crm_broker_solicitudes_tenant_restrictive ON public.crm_broker_solicitudes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id))
  WITH CHECK ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id));

DROP POLICY IF EXISTS comisiones_broker_tenant_restrictive ON public.comisiones_broker;
CREATE POLICY comisiones_broker_tenant_restrictive ON public.comisiones_broker
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id))
  WITH CHECK ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id));

DROP POLICY IF EXISTS liquidaciones_broker_tenant_restrictive ON public.liquidaciones_broker;
CREATE POLICY liquidaciones_broker_tenant_restrictive ON public.liquidaciones_broker
  AS RESTRICTIVE FOR ALL TO authenticated
  USING ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id))
  WITH CHECK ((NOT (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))) OR public.rls_tenant_scope_ok(organization_id));

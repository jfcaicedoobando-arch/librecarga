-- Disposable CI only. Preserve portal access while enforcing the active-tenant
-- boundary for super_admin. All fixtures and assertions roll back.
BEGIN;
\i supabase/tests/rls/_helpers.sql

DO $$
DECLARE
  t text;
  org_a uuid := gen_random_uuid(); org_b uuid := gen_random_uuid();
  admin_a uuid := gen_random_uuid(); sa uuid := gen_random_uuid(); broker_user uuid := gen_random_uuid();
  broker_a uuid := gen_random_uuid(); broker_b uuid := gen_random_uuid();
  n int;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_brokers', 'crm_broker_solicitudes', 'comisiones_broker', 'liquidaciones_broker'] LOOP
    PERFORM pg_temp.assert(EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_tenant_restrictive'
         AND permissive = 'RESTRICTIVE' AND cmd = 'ALL' AND roles = ARRAY['authenticated']::name[]
         AND qual LIKE '%has_role%super_admin%rls_tenant_scope_ok(organization_id)%'
         AND with_check = qual
    ), format('Missing complete restrictive tenant policy on %s', t));
  END LOOP;

  INSERT INTO public.organizations(id, nombre) VALUES (org_a, 'BROKER SCOPE A'), (org_b, 'BROKER SCOPE B');
  INSERT INTO public.organization_members(organization_id, user_id, role) VALUES (org_a, admin_a, 'admin_org');
  INSERT INTO public.user_roles(user_id, role) VALUES (admin_a, 'admin_org'), (sa, 'super_admin'), (broker_user, 'broker');
  INSERT INTO public.crm_brokers(id, organization_id, user_id, nombre, email, comision_pct) VALUES
    (broker_a, org_a, broker_user, 'BROKER A', 'broker-a@example.test', 25),
    (broker_b, org_b, broker_user, 'BROKER B', 'broker-b@example.test', 25);
  INSERT INTO public.liquidaciones_broker(organization_id, broker_id, periodo, total_mxn) VALUES
    (org_a, broker_a, '2026-11', 100), (org_b, broker_b, '2026-11', 200);

  PERFORM pg_temp.as_user(sa);
  SELECT count(*) INTO n FROM public.crm_brokers WHERE id IN (broker_a, broker_b);
  PERFORM pg_temp.assert(n = 0, 'Super admin without active tenant must not see brokers');
  SELECT count(*) INTO n FROM public.liquidaciones_broker WHERE broker_id IN (broker_a, broker_b);
  PERFORM pg_temp.assert(n = 0, 'Super admin without active tenant must not see liquidations');

  PERFORM public.set_super_admin_org(org_a);
  SELECT count(*) INTO n FROM public.crm_brokers WHERE id = broker_a;
  PERFORM pg_temp.assert(n = 1, 'Super admin must retain access to the active tenant');
  SELECT count(*) INTO n FROM public.crm_brokers WHERE id = broker_b;
  PERFORM pg_temp.assert(n = 0, 'Super admin must not see brokers outside the active tenant');
  SELECT count(*) INTO n FROM public.liquidaciones_broker WHERE broker_id = broker_b;
  PERFORM pg_temp.assert(n = 0, 'Super admin must not see liquidations outside the active tenant');

  PERFORM pg_temp.as_user(admin_a);
  SELECT count(*) INTO n FROM public.crm_brokers WHERE id IN (broker_a, broker_b);
  PERFORM pg_temp.assert(n = 1, 'Organization admin must retain its existing tenant boundary');

  PERFORM pg_temp.as_user(broker_user);
  SELECT count(*) INTO n FROM public.crm_brokers WHERE id IN (broker_a, broker_b);
  PERFORM pg_temp.assert(n = 2, 'Broker identity access across its organizations must remain unchanged');
  SELECT count(*) INTO n FROM public.broker_mis_organizaciones() WHERE broker_id IN (broker_a, broker_b);
  PERFORM pg_temp.assert(n = 2, 'Portal RPC must retain the broker organizations');
  PERFORM pg_temp.as_postgres();
END $$;
ROLLBACK;

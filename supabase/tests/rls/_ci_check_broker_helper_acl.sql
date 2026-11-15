-- Historical 0062/0064 helpers are owner-only in the real pre-harness dump.
-- Assert before blanket grants and after undoing only their artificial grants.
DO $broker_helper_acl$
DECLARE
  target record;
  fn oid;
  proc pg_catalog.pg_proc%ROWTYPE;
  owner_id oid := pg_catalog.to_regrole('postgres');
  client_role text;
BEGIN
  IF current_user <> 'postgres' OR session_user <> current_user OR owner_id IS NULL
     OR pg_catalog.to_regrole('anon') IS NULL
     OR pg_catalog.to_regrole('authenticated') IS NULL
     OR pg_catalog.to_regrole('service_role') IS NULL THEN
    RAISE EXCEPTION 'CI_BROKER_HELPER_ACL: exact owner and client roles required';
  END IF;
  FOR target IN SELECT * FROM (VALUES
    ('public._broker_actual(uuid)', 'v'),
    ('public._broker_de_pago(uuid,uuid,uuid)', 's')
  ) AS targets(signature, volatility) LOOP
    fn := pg_catalog.to_regprocedure(target.signature);
    IF fn IS NULL THEN
      RAISE EXCEPTION 'CI_BROKER_HELPER_ACL: missing helper %', target.signature;
    END IF;
    SELECT * INTO STRICT proc FROM pg_catalog.pg_proc WHERE oid = fn;
    IF proc.proowner IS DISTINCT FROM owner_id OR proc.prokind <> 'f'
       OR proc.prorettype <> 'public.crm_brokers'::regtype OR proc.proretset
       OR NOT proc.prosecdef OR proc.provolatile::text <> target.volatility
       OR proc.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
       OR proc.proacl IS NULL
       OR (SELECT count(*) FROM pg_catalog.aclexplode(proc.proacl)) <> 1
       OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(proc.proacl) a
         WHERE a.grantor <> owner_id OR a.grantee <> owner_id
           OR a.is_grantable OR a.privilege_type <> 'EXECUTE') THEN
      RAISE EXCEPTION 'CI_BROKER_HELPER_ACL: exact owner-only definer helper required for %', target.signature;
    END IF;
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF pg_catalog.has_function_privilege(client_role, fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'CI_BROKER_HELPER_ACL: unexpected EXECUTE for % on %', client_role, target.signature;
      END IF;
    END LOOP;
  END LOOP;
END
$broker_helper_acl$;

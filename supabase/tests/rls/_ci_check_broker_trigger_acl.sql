-- Same read-only assertion before CI blanket grants and after their reversal.
-- Never repair a real replay leak before this check has observed it.
DO $broker_trigger_acl$
DECLARE target record; fn oid; client_role text;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('public._comision_kam_broker()', 'trg_b00_comision_kam_broker'),
    ('public._comision_broker_sync()', 'trg_comision_broker_sync')
  ) AS targets(signature, trigger_name) LOOP
    fn := pg_catalog.to_regprocedure(target.signature);
    IF fn IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_trigger t ON t.tgfoid = p.oid
      WHERE p.oid = fn AND p.proowner = 'postgres'::regrole
        AND p.prorettype = 'trigger'::regtype AND p.prosecdef
        AND p.proconfig = ARRAY['search_path=public']::text[]
        AND t.tgname = target.trigger_name
        AND t.tgrelid = 'public.comisiones_devengadas'::regclass AND NOT t.tgisinternal
    ) THEN
      RAISE EXCEPTION 'CI_BROKER_TRIGGER_ACL: expected existing definer trigger %', target.signature;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p,
        LATERAL pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
      WHERE p.oid = fn AND (a.grantee <> p.proowner OR a.grantor <> p.proowner)
    ) THEN
      RAISE EXCEPTION 'CI_BROKER_TRIGGER_ACL: non-owner privilege on %', target.signature;
    END IF;
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF pg_catalog.has_function_privilege(client_role, fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'CI_BROKER_TRIGGER_ACL: inherited or direct EXECUTE for % on %', client_role, target.signature;
      END IF;
    END LOOP;
  END LOOP;
END
$broker_trigger_acl$;

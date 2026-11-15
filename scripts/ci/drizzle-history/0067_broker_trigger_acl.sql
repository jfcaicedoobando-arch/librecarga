-- These SECURITY DEFINER helpers are trigger-only, not RPC entry points.
-- PostgreSQL rejects ordinary direct calls to RETURNS trigger functions; no
-- direct-call exploit is asserted. Close unnecessary EXECUTE without changing
-- their bodies, trigger bindings, commission calculations or existing rows.
DO $broker_trigger_precondition$
DECLARE target record;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('public._comision_kam_broker()', 'trg_b00_comision_kam_broker'),
    ('public._comision_broker_sync()', 'trg_comision_broker_sync')
  ) AS targets(signature, trigger_name) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_trigger t ON t.tgfoid = p.oid
      WHERE p.oid = pg_catalog.to_regprocedure(target.signature)
        AND p.proowner = 'postgres'::regrole AND p.prorettype = 'trigger'::regtype
        AND p.prosecdef AND p.proconfig = ARRAY['search_path=public']::text[]
        AND t.tgname = target.trigger_name
        AND t.tgrelid = 'public.comisiones_devengadas'::regclass AND NOT t.tgisinternal
    ) THEN
      RAISE EXCEPTION 'BROKER_TRIGGER_ACL: expected existing definer trigger %', target.signature;
    END IF;
  END LOOP;
END
$broker_trigger_precondition$;

REVOKE ALL ON FUNCTION public._comision_kam_broker() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._comision_broker_sync() FROM PUBLIC, anon, authenticated, service_role;

DO $broker_trigger_postcondition$
DECLARE signature text; fn oid; client_role text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public._comision_kam_broker()', 'public._comision_broker_sync()'] LOOP
    fn := pg_catalog.to_regprocedure(signature);
    IF EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc p,
        LATERAL pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
      WHERE p.oid = fn AND (a.grantee <> p.proowner OR a.grantor <> p.proowner)
    ) THEN
      RAISE EXCEPTION 'BROKER_TRIGGER_ACL: unexpected non-owner privilege on %', signature;
    END IF;
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF pg_catalog.has_function_privilege(client_role, fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'BROKER_TRIGGER_ACL: inherited or direct EXECUTE for % on %', client_role, signature;
      END IF;
    END LOOP;
  END LOOP;
END
$broker_trigger_postcondition$;

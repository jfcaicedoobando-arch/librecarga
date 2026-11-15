BEGIN;
\ir rls/_ci_check_broker_trigger_acl.sql
\ir rls/_ci_check_broker_helper_acl.sql

-- Exercise the real functions from triggers on synthetic temporary rows only.
-- No production commission is inserted or changed by this regression.
CREATE TEMP TABLE broker_trigger_acl_probe (
  id uuid NOT NULL,
  estado public.estado_comision NOT NULL,
  vendedora_id uuid
);
CREATE TRIGGER broker_acl_before BEFORE INSERT ON broker_trigger_acl_probe
  FOR EACH ROW EXECUTE FUNCTION public._comision_kam_broker();
CREATE TRIGGER broker_acl_after AFTER INSERT ON broker_trigger_acl_probe
  FOR EACH ROW EXECUTE FUNCTION public._comision_broker_sync();
GRANT INSERT, SELECT ON broker_trigger_acl_probe TO authenticated;
SET LOCAL ROLE authenticated;
INSERT INTO broker_trigger_acl_probe VALUES (gen_random_uuid(), 'Cancelada', NULL);
RESET ROLE;
DO $broker_trigger_fires$
BEGIN
  IF (SELECT count(*) FROM broker_trigger_acl_probe) <> 1 THEN
    RAISE EXCEPTION 'BROKER_TRIGGER_ACL: trigger execution must survive direct EXECUTE revocation';
  END IF;
END
$broker_trigger_fires$;
ROLLBACK;

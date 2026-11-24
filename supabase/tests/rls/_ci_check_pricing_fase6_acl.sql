-- Assert product privileges before the blanket CI grants and after restoring them.
DO $pricing_fase6_acl$
DECLARE
  v_expected record;
  v_proc record;
  v_table regclass := to_regclass('public.crm_pricing_opciones_versiones');
BEGIN
  FOR v_expected IN SELECT * FROM (VALUES
    ('public._crm_pricing_validar_msds()', false, true, true),
    ('public._crm_pricing_version_guard()', false, false, false),
    ('public._crm_pricing_perdida_guard()', false, false, false),
    ('public.crm_pricing_recotizar(uuid,text)', true, true, true),
    ('public.crm_pricing_costo_vs_real(uuid[])', true, true, false),
    ('public.crm_pricing_marcar_perdida(uuid,uuid,text)', true, false, true)
  ) AS expected(signature, authenticated_access, service_access, security_definer)
  LOOP
    SELECT oid, prosecdef INTO v_proc FROM pg_catalog.pg_proc
    WHERE oid = to_regprocedure(v_expected.signature);
    IF NOT FOUND OR v_proc.prosecdef IS DISTINCT FROM v_expected.security_definer
       OR has_function_privilege('public', v_proc.oid, 'EXECUTE')
       OR has_function_privilege('anon', v_proc.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', v_proc.oid, 'EXECUTE') IS DISTINCT FROM v_expected.authenticated_access
       OR has_function_privilege('service_role', v_proc.oid, 'EXECUTE') IS DISTINCT FROM v_expected.service_access THEN
      RAISE EXCEPTION 'ACL inesperada en Pricing: %', v_expected.signature;
    END IF;
  END LOOP;

  IF v_table IS NULL
     OR NOT has_table_privilege('authenticated', v_table, 'SELECT')
     OR has_table_privilege('authenticated', v_table, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
     OR has_table_privilege('anon', v_table, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') THEN
    RAISE EXCEPTION 'ACL inesperada en versiones de Pricing';
  END IF;
END
$pricing_fase6_acl$;

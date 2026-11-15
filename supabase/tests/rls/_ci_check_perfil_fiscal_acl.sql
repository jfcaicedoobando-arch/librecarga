-- Assert the product ACL before CI grants and after restoring it; never repair here.
DO $perfil_fiscal_acl$
DECLARE client_role text; privilege_name text; signature text; fn oid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.perfiles_fiscales_emisor')
    AND relrowsecurity AND relowner = 'postgres'::regrole) THEN
    RAISE EXCEPTION 'CI_PERFIL_FISCAL_ACL: missing owned RLS table';
  END IF;
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF has_table_privilege(client_role, 'public.perfiles_fiscales_emisor', 'SELECT')
      IS DISTINCT FROM (client_role <> 'anon') THEN
      RAISE EXCEPTION 'CI_PERFIL_FISCAL_ACL: unexpected SELECT for %', client_role;
    END IF;
    FOREACH privilege_name IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
      IF has_table_privilege(client_role, 'public.perfiles_fiscales_emisor', privilege_name) THEN
        RAISE EXCEPTION 'CI_PERFIL_FISCAL_ACL: unexpected % for %', privilege_name, client_role;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
    'public.registrar_perfil_fiscal_emisor(uuid,text,uuid,timestamptz,integer,jsonb)',
    'public._perfil_fiscal_emisor_resultado(public.perfiles_fiscales_emisor,public.facturapi_credenciales,text)',
    'public.obtener_perfil_fiscal_emisor(uuid,text)',
    'public.confirmar_perfil_fiscal_emisor(uuid,text,uuid,date)'
  ] LOOP
    fn := to_regprocedure(signature);
    IF fn IS NULL OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = fn
      AND proowner = 'postgres'::regrole AND proconfig = ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
      AND prosecdef = (proname <> '_perfil_fiscal_emisor_resultado')) THEN
      RAISE EXCEPTION 'CI_PERFIL_FISCAL_ACL: unexpected function metadata %', signature;
    END IF;
    IF has_function_privilege('anon', fn, 'EXECUTE')
      OR NOT has_function_privilege('service_role', fn, 'EXECUTE')
      OR has_function_privilege('authenticated', fn, 'EXECUTE') IS DISTINCT FROM
        (signature LIKE 'public.obtener_%' OR signature LIKE 'public.confirmar_%') THEN
      RAISE EXCEPTION 'CI_PERFIL_FISCAL_ACL: unexpected EXECUTE %', signature;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_proc p,
      LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = fn AND a.grantee = 0) THEN
      RAISE EXCEPTION 'CI_PERFIL_FISCAL_ACL: PUBLIC privilege %', signature;
    END IF;
  END LOOP;
END
$perfil_fiscal_acl$;

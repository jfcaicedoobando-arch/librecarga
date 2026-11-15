BEGIN READ ONLY;
DO $ledger_check$
DECLARE n bigint; fingerprint text;
BEGIN
  SELECT count(*), encode(sha256(convert_to(coalesce(string_agg(id::text||':'||hash||':'||created_at::text, E'\n' ORDER BY id), ''), 'UTF8')), 'hex')
    INTO n, fingerprint FROM drizzle.__drizzle_migrations WHERE created_at <= 1794694500000;
  IF n <> 67 OR fingerprint IS DISTINCT FROM 'b8db6f1bb5404bc8fa7fb6b9061690bff29f4f07f455b8ed9f2c502b93f3c7e3' THEN
    RAISE EXCEPTION 'DEPLOY90: existing Drizzle ledger drift';
  END IF;
END
$ledger_check$;
DO $ledger_after$
BEGIN
  IF (SELECT count(*) FROM drizzle.__drizzle_migrations) <> 70 THEN
    RAISE EXCEPTION 'DEPLOY90: unexpected final ledger count';
  END IF;
  IF EXISTS (SELECT 1 FROM (VALUES ('ac331d449940dae8b2b2e80d1771e66d3c3d6157c9925080b18daa5c7fee4d2f', 1794694500001::bigint),('c1e04873d1bdb4a5d89fbb4837f6a0dcc33c07bb241b9d7963ba63e80aebdad9', 1794694500002::bigint),('b9ff6b1ea3bcfd3add4fe4829a4ff8f7731a8181181e8fd06a8acb5ade3c7cd1', 1794694500003::bigint)) AS expected(hash, stamp)
    WHERE (SELECT count(*) FROM drizzle.__drizzle_migrations d WHERE d.hash=expected.hash AND d.created_at=expected.stamp) <> 1) THEN
    RAISE EXCEPTION 'DEPLOY90: missing/duplicate applied migration';
  END IF;
END
$ledger_after$;
DO $body_check$
DECLARE expected record;
BEGIN
  FOR expected IN SELECT * FROM (VALUES
    ('public._comision_broker_sync()', 'f4eaebadc778dcd62f674b5e6def21320a028fb425f3d79215034b69637f07e5'),
    ('public._comision_kam_broker()', '173d1b8415d057157c301ed48d88aa6ef01585ac812070d0440de7a474d65515'),
    ('public.has_any_role_in_org_exact(uuid,public.app_role[],uuid)', '8956f1ecb143c9693a6912f60bc1f6dfa1142163f594857a4f2c51c1cf629590'),
    ('public.org_requerida(uuid)', 'e7256d08b5f11687b2b2d379dc5855df38fb25d5cd326664ccdaf293f4acd22f'),
    ('public.org_scope()', '8125029726d251ae46d4d34eae0bd5aca7d6ea32e36be93c50f7918d95d64572'),
    ('public.rls_tenant_scope_ok(uuid)', 'a917b7f694d0f3e8fc91ad7574f2b2283f5f78993888cf69927f021093fa2b00'),
    ('public.update_updated_at_column()', 'e074d3db8073b75d3d30dc88b1bfccd78344fdb695a013054e0d6944708c2882'),
    ('public.facturas_listado_pagina(uuid,text,text,date,date,integer,integer,text)', 'a7269c003938ae1c833c0abe628005ed20c38016dd11f98fa424213342175200'),
    ('public.facturas_clientes_listado(uuid)', 'a0956b8023d5a1bf0136aaf1d4d77f6864339096291da90708910d2ba772738f'),
    ('public._perfil_fiscal_emisor_resultado(public.perfiles_fiscales_emisor,public.facturapi_credenciales,text)', '300029ad3862b57cc50fb71035803e8e4f1cdf89cf6455987893481b8f656d43'),
    ('public.obtener_perfil_fiscal_emisor(uuid,text)', 'da5e78d9ed85571a10c232bb1d1a6090d28de39fcd633897e3a126a86d2eb97a'),
    ('public.registrar_perfil_fiscal_emisor(uuid,text,uuid,timestamptz,integer,jsonb)', '7dd215e003341c9936df40626bed3faa50480ae042b08b1b5b4fc057c507dd9b'),
    ('public.confirmar_perfil_fiscal_emisor(uuid,text,uuid,date)', '0009ac90e5038784187e9f7bb09c694bc97ca5baaf8b229300d170c151c6f735')
  ) AS x(signature, hash) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regprocedure(expected.signature)
      AND proowner = 'postgres'::regrole
      AND encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') = expected.hash) THEN
      RAISE EXCEPTION 'DEPLOY90: function body/owner drift %', expected.signature;
    END IF;
  END LOOP;
END
$body_check$;
DO $fiscal_policies$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='perfiles_fiscales_emisor') <> 2
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='perfiles_fiscales_emisor'
      AND policyname='perfil_fiscal_emisor_lectura' AND permissive='PERMISSIVE' AND cmd='SELECT'
      AND roles=ARRAY['authenticated']::name[] AND qual LIKE '%org_scope()%has_any_role_in_org_exact%')
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='perfiles_fiscales_emisor'
      AND policyname='perfiles_fiscales_emisor_tenant_restrictive' AND permissive='RESTRICTIVE' AND cmd='ALL'
      AND roles=ARRAY['authenticated']::name[] AND qual=with_check
      AND qual LIKE '%has_role%super_admin%rls_tenant_scope_ok(organization_id)%') THEN
    RAISE EXCEPTION 'DEPLOY90: fiscal RLS policy contract mismatch';
  END IF;
END
$fiscal_policies$;
-- Ejecutar tras el replay y ANTES de _ci_post_migrate.sql: sus GRANT amplios
-- no deben ocultar un permiso faltante en la migración de producto 0066.
DO $check$
DECLARE
  firma text;
  fn pg_proc%ROWTYPE;
BEGIN
  FOREACH firma IN ARRAY ARRAY[
    'public.facturas_listado_pagina(uuid,text,text,date,date,integer,integer,text)',
    'public.facturas_clientes_listado(uuid)'
  ] LOOP
    SELECT * INTO STRICT fn FROM pg_proc WHERE oid = firma::regprocedure;
    IF fn.prosecdef OR fn.provolatile <> 's'
       OR NOT coalesce(fn.proconfig @> ARRAY['search_path=public'], false) THEN
      RAISE EXCEPTION 'Contrato INVOKER/STABLE/search_path incorrecto: %', firma;
    END IF;
    IF has_function_privilege('anon', fn.oid, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM aclexplode(coalesce(fn.proacl, acldefault('f', fn.proowner)))
         WHERE grantee = 0 AND privilege_type = 'EXECUTE') THEN
      RAISE EXCEPTION 'Función accesible a anon/PUBLIC: %', firma;
    END IF;
    IF NOT has_function_privilege('authenticated', fn.oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Falta permiso explícito para consumidor de producto: %', firma;
    END IF;
  END LOOP;
END;
$check$;
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
ROLLBACK;

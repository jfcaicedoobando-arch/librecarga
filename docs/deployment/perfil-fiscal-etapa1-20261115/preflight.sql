BEGIN READ ONLY;
DO $preflight$
BEGIN
  IF current_user <> 'postgres' OR current_setting('server_version_num')::integer / 10000 <> 17 THEN
    RAISE EXCEPTION 'DEPLOY90: expected PostgreSQL17/postgres';
  END IF;
  IF (SELECT count(*) FROM drizzle.__drizzle_migrations) <> 67
    OR (SELECT max(created_at) FROM drizzle.__drizzle_migrations) <> 1794694500000 THEN
    RAISE EXCEPTION 'DEPLOY90: unexpected migration tail';
  END IF;
  IF to_regclass('public.perfiles_fiscales_emisor') IS NOT NULL
    OR to_regtype('public.perfiles_fiscales_emisor') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('facturas_listado_pagina','facturas_clientes_listado','_perfil_fiscal_emisor_resultado','obtener_perfil_fiscal_emisor','registrar_perfil_fiscal_emisor','confirmar_perfil_fiscal_emisor')) THEN
    RAISE EXCEPTION 'DEPLOY90: target table/type/function already exists; do not overwrite';
  END IF;
  IF EXISTS (SELECT 1 FROM (VALUES ('facturas'), ('proformas')) AS expected(name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=expected.name AND c.relrowsecurity)) THEN
    RAISE EXCEPTION 'DEPLOY90: required invoice/proforma RLS missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.facturapi_credenciales'::regclass
    AND tgname='trg_facturapi_credenciales_updated_at' AND tgenabled='O'
    AND tgfoid='public.update_updated_at_column()'::regprocedure AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'DEPLOY90: credentials rotation timestamp trigger missing';
  END IF;
  IF EXISTS (SELECT 1 FROM (VALUES
    ('public','facturapi_credenciales','organization_id','uuid'),
    ('public','facturapi_credenciales','facturapi_org_id','text'),
    ('public','facturapi_credenciales','updated_at','timestamptz'),
    ('public','configuracion','organization_id','uuid'),
    ('public','configuracion','categoria','text'),
    ('public','configuracion','clave','text'),
    ('public','configuracion','valor','jsonb'),
    ('public','organizations','id','uuid'),
    ('auth','users','id','uuid')
  ) AS required(schema_name,table_name,column_name,type_name)
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema=required.schema_name AND c.table_name=required.table_name
        AND c.column_name=required.column_name AND c.udt_name=required.type_name)) THEN
    RAISE EXCEPTION 'DEPLOY90: fiscal dependency column/type mismatch';
  END IF;
END
$preflight$;
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
    ('public.update_updated_at_column()', 'e074d3db8073b75d3d30dc88b1bfccd78344fdb695a013054e0d6944708c2882')
  ) AS x(signature, hash) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regprocedure(expected.signature)
      AND proowner = 'postgres'::regrole
      AND encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') = expected.hash) THEN
      RAISE EXCEPTION 'DEPLOY90: function body/owner drift %', expected.signature;
    END IF;
  END LOOP;
END
$body_check$;
ROLLBACK;

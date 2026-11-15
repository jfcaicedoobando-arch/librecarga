// Build reviewable SQL from immutable sources; never opens a database connection.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const out = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(out, '../../..');
const sha = text => createHash('sha256').update(text).digest('hex');
const sources = [
  ['0066_facturas_filtros_globales', 'ac331d449940dae8b2b2e80d1771e66d3c3d6157c9925080b18daa5c7fee4d2f', 1794694500001],
  ['0067_broker_trigger_acl', 'c1e04873d1bdb4a5d89fbb4837f6a0dcc33c07bb241b9d7963ba63e80aebdad9', 1794694500002],
  ['0068_perfil_fiscal_emisor', 'b9ff6b1ea3bcfd3add4fe4829a4ff8f7731a8181181e8fd06a8acb5ade3c7cd1', 1794694500003],
];
const sql = sources.map(([tag, hash]) => {
  const source = fs.readFileSync(path.join(root, 'drizzle/migrations', tag + '.sql'), 'utf8');
  if (sha(source) !== hash) throw new Error(`Source drift: ${tag}`);
  return source;
});
const priorLedger = 'b8db6f1bb5404bc8fa7fb6b9061690bff29f4f07f455b8ed9f2c502b93f3c7e3';
const dependencies = [
  ['_comision_broker_sync()', 'f4eaebadc778dcd62f674b5e6def21320a028fb425f3d79215034b69637f07e5'],
  ['_comision_kam_broker()', '173d1b8415d057157c301ed48d88aa6ef01585ac812070d0440de7a474d65515'],
  ['has_any_role_in_org_exact(uuid,public.app_role[],uuid)', '8956f1ecb143c9693a6912f60bc1f6dfa1142163f594857a4f2c51c1cf629590'],
  ['org_requerida(uuid)', 'e7256d08b5f11687b2b2d379dc5855df38fb25d5cd326664ccdaf293f4acd22f'],
  ['org_scope()', '8125029726d251ae46d4d34eae0bd5aca7d6ea32e36be93c50f7918d95d64572'],
  ['rls_tenant_scope_ok(uuid)', 'a917b7f694d0f3e8fc91ad7574f2b2283f5f78993888cf69927f021093fa2b00'],
  ['update_updated_at_column()', 'e074d3db8073b75d3d30dc88b1bfccd78344fdb695a013054e0d6944708c2882'],
];
const newFunctions = [
  ['facturas_listado_pagina(uuid,text,text,date,date,integer,integer,text)', 0],
  ['facturas_clientes_listado(uuid)', 0],
  ['_perfil_fiscal_emisor_resultado(public.perfiles_fiscales_emisor,public.facturapi_credenciales,text)', 2],
  ['obtener_perfil_fiscal_emisor(uuid,text)', 2],
  ['registrar_perfil_fiscal_emisor(uuid,text,uuid,timestamptz,integer,jsonb)', 2],
  ['confirmar_perfil_fiscal_emisor(uuid,text,uuid,date)', 2],
];
const names = newFunctions.map(([signature]) => signature.split('(')[0]);
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
const bodyHashes = newFunctions.map(([signature, index]) => {
  const name = signature.split('(')[0];
  const match = sql[index].match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\bAS\\s+(\\$[^$]*\\$)([\\s\\S]*?)\\1;`));
  if (!match) throw new Error(`Cannot extract ${name}`);
  return [signature, sha(match[2])];
});
function bodyCheck(entries) {
  return `DO $body_check$
DECLARE expected record;
BEGIN
  FOR expected IN SELECT * FROM (VALUES
    ${entries.map(([sig, hash]) => `(${literal('public.' + sig)}, ${literal(hash)})`).join(',\n    ')}
  ) AS x(signature, hash) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regprocedure(expected.signature)
      AND proowner = 'postgres'::regrole
      AND encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') = expected.hash) THEN
      RAISE EXCEPTION 'DEPLOY90: function body/owner drift %', expected.signature;
    END IF;
  END LOOP;
END
$body_check$;\n`;
}
const preservedLedger = `DO $ledger_check$
DECLARE n bigint; fingerprint text;
BEGIN
  SELECT count(*), encode(sha256(convert_to(coalesce(string_agg(id::text||':'||hash||':'||created_at::text, E'\\n' ORDER BY id), ''), 'UTF8')), 'hex')
    INTO n, fingerprint FROM drizzle.__drizzle_migrations WHERE created_at <= 1794694500000;
  IF n <> 67 OR fingerprint IS DISTINCT FROM '${priorLedger}' THEN
    RAISE EXCEPTION 'DEPLOY90: existing Drizzle ledger drift';
  END IF;
END
$ledger_check$;\n`;
const prerequisites = `DO $preflight$
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
      WHERE n.nspname='public' AND p.proname IN (${names.map(literal).join(',')})) THEN
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
$preflight$;\n`;
const productCheck = file => {
  const text = fs.readFileSync(path.join(root, 'supabase/tests/rls', file), 'utf8').replace(/\r\n/g, '\n')
    .replace(/^BEGIN READ ONLY;\n/gm, '').replace(/^ROLLBACK;\n/gm, '');
  if (/^\s*(GRANT|REVOKE|INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP)\b/im.test(text)
    || /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(text)) {
    throw new Error(`Postcheck contains a mutation/transaction: ${file}`);
  }
  return text;
};
const ledgerAfter = `DO $ledger_after$
BEGIN
  IF (SELECT count(*) FROM drizzle.__drizzle_migrations) <> 70 THEN
    RAISE EXCEPTION 'DEPLOY90: unexpected final ledger count';
  END IF;
  IF EXISTS (SELECT 1 FROM (VALUES ${sources.map(([, hash, when]) => `('${hash}', ${when}::bigint)`).join(',')}) AS expected(hash, stamp)
    WHERE (SELECT count(*) FROM drizzle.__drizzle_migrations d WHERE d.hash=expected.hash AND d.created_at=expected.stamp) <> 1) THEN
    RAISE EXCEPTION 'DEPLOY90: missing/duplicate applied migration';
  END IF;
END
$ledger_after$;\n`;
const fiscalPolicies = `DO $fiscal_policies$
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
$fiscal_policies$;\n`;
const post = preservedLedger + ledgerAfter + bodyCheck([...dependencies, ...bodyHashes]) + fiscalPolicies
  + productCheck('_ci_check_facturas_filtros_acl.sql')
  + productCheck('_ci_check_broker_trigger_acl.sql')
  + productCheck('_ci_check_perfil_fiscal_acl.sql');
const pre = prerequisites + preservedLedger + bodyCheck(dependencies);
const application = `-- REVIEWED APPLICATION CANDIDATE. Do not execute before CI/release approval.
-- Source bytes below are verified by build-envelope.mjs. No fixtures or CI grants.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SET LOCAL check_function_bodies = on;
SELECT pg_advisory_xact_lock(hashtextextended('librecarga:drizzle:apply', 0));
LOCK TABLE drizzle.__drizzle_migrations IN EXCLUSIVE MODE;
${pre}
${sql.join('\n')}
-- Append only these new journal entries. Existing ledgers are never repaired.
INSERT INTO drizzle.__drizzle_migrations(hash, created_at) VALUES
${sources.map(([, hash, when]) => `  ('${hash}', ${when})`).join(',\n')};
${post}
NOTIFY pgrst, 'reload schema';
COMMIT;
`;
fs.writeFileSync(path.join(out, 'preflight.sql'), 'BEGIN READ ONLY;\n' + pre + 'ROLLBACK;\n');
fs.writeFileSync(path.join(out, 'application.sql'), application);
fs.writeFileSync(path.join(out, 'postchecks.sql'), 'BEGIN READ ONLY;\n' + post + 'ROLLBACK;\n');
fs.writeFileSync(path.join(out, 'envelope.json'), JSON.stringify({
  projectId: '341dfc00-0308-4aba-9246-e4b2041e31f1',
  observedServer: '17.6', isolatedValidationServer: '17.9',
  priorLedgerCount: 67, priorLedgerFingerprint: priorLedger,
  sources: sources.map(([tag, hash, when]) => ({ path: `drizzle/migrations/${tag}.sql`, sha256: hash, journalWhen: when })),
  applicationSha256: sha(application), newFunctionBodyHashes: bodyHashes,
}, null, 2) + '\n');
console.log('Prepared envelope; no database connection was opened.');

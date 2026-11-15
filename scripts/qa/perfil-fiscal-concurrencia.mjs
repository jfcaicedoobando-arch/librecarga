#!/usr/bin/env node
/**
 * Disposable PostgreSQL 17.9 only. Three connections: two competing writers
 * plus a read-only lock observer. Commits only synthetic fixture rows; discard
 * the owned database afterwards. No external provider calls or schema changes.
 * PERFIL_FISCAL_CONCURRENCIA_LOCAL=1 PGDATABASE=<owned_db> PGPORT=55441 node scripts/qa/perfil-fiscal-concurrencia.mjs
 * PSQL may name a native Windows psql executable. No connection URL is accepted.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

if (process.env.PERFIL_FISCAL_CONCURRENCIA_LOCAL !== '1') throw new Error('Explicit disposable-database opt-in required');
for (const key of ['PGHOST', 'PGHOSTADDR']) {
  if (process.env[key] && !['127.0.0.1', 'localhost', '::1'].includes(process.env[key])) throw new Error('Loopback only');
}
if (process.env.PGPORT && process.env.PGPORT !== '55441') throw new Error('Only the owned test port 55441 is allowed');
if (!/^[a-zA-Z0-9_]+$/.test(process.env.PGDATABASE || '')) throw new Error('Explicit local database name required, never a URI/DSN');
if (process.env.PGUSER && process.env.PGUSER !== 'postgres') throw new Error('The owned fixture runner requires postgres');
const env = { ...process.env, PGHOST: '127.0.0.1', PGHOSTADDR: '127.0.0.1',
  PGPORT: '55441', PGUSER: 'postgres', PGSSLMODE: 'disable', PGCONNECT_TIMEOUT: '5' };
for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'DATABASE_URL', 'SUPABASE_DB_URL', 'PGOPTIONS']) delete env[key];
const runId = randomUUID().replaceAll('-', '').slice(0, 12);
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";

class Session {
  constructor(label) {
    this.label = `perfil_fiscal_${runId}_${label}`;
    this.buffer = '';
    this.stderr = '';
    this.pending = null;
    this.failure = null;
    this.proc = spawn(process.env.PSQL || 'psql', ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1'], {
      env: { ...env, PGAPPNAME: this.label }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stderr.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk) => { this.buffer += chunk.replaceAll('\r', ''); this.drain(); });
    this.proc.stderr.on('data', (chunk) => { this.stderr += chunk; });
    this.proc.on('error', (error) => this.fail(error));
    this.proc.on('exit', (code, signal) => {
      if (this.pending || code) this.fail(new Error(`${this.label} exited ${code ?? signal}: ${this.stderr}`));
    });
  }
  fail(error) {
    this.failure = error;
    this.pending?.reject(error);
    this.pending = null;
  }
  drain() {
    if (!this.pending) return;
    const end = this.buffer.indexOf(`${this.pending.marker}\n`);
    if (end < 0) return;
    const result = this.buffer.slice(0, end).trim();
    this.buffer = this.buffer.slice(end + this.pending.marker.length + 1);
    const { resolve } = this.pending;
    this.pending = null;
    resolve(result);
  }
  query(sql) {
    if (this.failure) return Promise.reject(this.failure);
    if (this.pending) return Promise.reject(new Error(`Concurrent query on session ${this.label}`));
    const marker = `__done_${randomUUID().replaceAll('-', '')}__`;
    return new Promise((resolve, reject) => {
      this.pending = { marker, resolve, reject };
      this.proc.stdin.write(`${sql};\n\\echo ${marker}\n`);
    });
  }
  async close() {
    if (!this.failure && !this.pending) {
      try { await this.query('ROLLBACK'); } catch { /* Broken sessions already roll back on disconnect. */ }
    }
    this.proc.stdin.end();
    this.proc.kill('SIGTERM');
  }
}

const control = new Session('observer');
const first = new Session('first');
const second = new Session('second');
const sessions = [control, first, second];
const org = randomUUID();
const actor = randomUUID();
const results = [];
const data = { facturapi_org_id: `qa-${runId}`, rfc: 'GODE561231GR8', razon_social: 'Emisor sintético', regimen_fiscal: '626', codigo_postal: '01000' };

async function waitForLock(session) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (session.failure) throw session.failure;
    const waiting = await control.query(`SELECT coalesce(bool_or(wait_event_type = 'Lock'), false)
      FROM pg_stat_activity WHERE application_name = ${literal(session.label)}`);
    if (waiting === 't') return;
    await delay(20);
  }
  throw new Error('Competing writer never reached the expected row lock');
}

// Catch only to record the SQLSTATE; each scenario asserts the exact expected
// state/message. Unexpected failures cannot be reported as a successful conflict.
async function outcome(session, expression) {
  const raw = await session.query(`TRUNCATE pg_temp.qa_fiscal_outcome;
    DO $qa$ BEGIN
      INSERT INTO pg_temp.qa_fiscal_outcome VALUES (jsonb_build_object('ok', true, 'value', ${expression}));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO pg_temp.qa_fiscal_outcome VALUES (jsonb_build_object('ok', false, 'state', SQLSTATE, 'message', SQLERRM));
    END $qa$;
    SELECT value::text FROM pg_temp.qa_fiscal_outcome`);
  return JSON.parse(raw);
}
const register = (stamp, version) => `public.registrar_perfil_fiscal_emisor(${literal(org)}, 'sandbox', ${literal(actor)}, ${literal(stamp)}::timestamptz, ${version}, ${literal(JSON.stringify(data))}::jsonb)`;
const confirm = id => `public.confirmar_perfil_fiscal_emisor(${literal(org)}, 'sandbox', ${literal(id)}::uuid, NULL)`;
const timestamp = () => control.query(`SELECT updated_at::text FROM public.facturapi_credenciales WHERE organization_id = ${literal(org)}`);

try {
  assert.equal(await control.query('SHOW server_version_num'), '170009', 'Use the reviewed PostgreSQL 17.9 runtime');
  for (const session of sessions) await session.query("SET statement_timeout = '20s'; SET lock_timeout = '15s'");
  await control.query(`BEGIN;
    INSERT INTO public.organizations(id,nombre) VALUES (${literal(org)}, ${literal(`Perfil concurrency ${runId}`)});
    INSERT INTO auth.users(id,email,raw_user_meta_data)
      VALUES (${literal(actor)}, ${literal(`perfil-${runId}@qa.invalid`)}, '{"skip_auto_org":true}'::jsonb);
    INSERT INTO public.organization_members(organization_id,user_id,role) VALUES (${literal(org)}, ${literal(actor)}, 'contador');
    INSERT INTO public.user_roles(user_id,role) VALUES (${literal(actor)}, 'contador')
      ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
    INSERT INTO public.configuracion(organization_id,categoria,clave,valor)
      VALUES (${literal(org)},'empresa','rfc', '"GODE561231GR8"'::jsonb)
      ON CONFLICT (organization_id,categoria,clave) DO UPDATE SET valor = EXCLUDED.valor;
    INSERT INTO public.facturapi_credenciales(organization_id,ambiente,facturapi_org_id)
      VALUES (${literal(org)},'sandbox',${literal(data.facturapi_org_id)});
    COMMIT`);
  for (const session of [first, second]) await session.query(`CREATE TEMP TABLE qa_fiscal_outcome(value jsonb);
    SET request.jwt.claims = ${literal(JSON.stringify({ sub: actor, role: 'authenticated' }))}`);

  const stamp = await timestamp();
  await first.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  const winner = await outcome(first, register(stamp, 0));
  assert.equal(winner.ok, true);
  await second.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  const waitingDuplicate = outcome(second, register(stamp, 0));
  await waitForLock(second);
  await first.query('COMMIT');
  const duplicate = await waitingDuplicate;
  assert.deepEqual([duplicate.ok, duplicate.state, duplicate.message], [false, '40001', 'LC_PERFIL_FISCAL_VERSION_CAMBIO']);
  await second.query('ROLLBACK');
  assert.equal(await control.query(`SELECT count(*) FROM public.perfiles_fiscales_emisor WHERE organization_id = ${literal(org)}`), '1');
  results.push({ case: 'same expected version: one winner, one 40001, one stored version', pass: true });

  await first.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  await first.query(`UPDATE public.facturapi_credenciales SET api_key_sandbox_last4 = 'QA01' WHERE organization_id = ${literal(org)}`);
  await second.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  const waitingRotation = outcome(second, register(stamp, 1));
  await waitForLock(second);
  await first.query('COMMIT');
  const rotation = await waitingRotation;
  assert.deepEqual([rotation.ok, rotation.state, rotation.message], [false, '40001', 'LC_PERFIL_FISCAL_CONFIG_CAMBIO']);
  await second.query('ROLLBACK');
  assert.equal(await control.query(`SELECT count(*) FROM public.perfiles_fiscales_emisor WHERE organization_id = ${literal(org)}`), '1');
  results.push({ case: 'credential rotation while waiting: stale response rejected, no extra version', pass: true });

  const newStamp = await timestamp();
  assert.notEqual(newStamp, stamp);
  await first.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  const replacement = await outcome(first, register(newStamp, 1));
  assert.equal(replacement.ok, true);
  await second.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  const waitingConfirmation = outcome(second, confirm(winner.value));
  await waitForLock(second);
  await first.query('COMMIT');
  const staleConfirmation = await waitingConfirmation;
  assert.deepEqual([staleConfirmation.ok, staleConfirmation.state, staleConfirmation.message], [false, '40001', 'LC_PERFIL_FISCAL_VERSION_CAMBIO']);
  await second.query('ROLLBACK');
  assert.equal(await control.query(`SELECT count(*) FROM public.perfiles_fiscales_emisor WHERE organization_id = ${literal(org)} AND confirmado_at IS NOT NULL`), '0');
  const confirmed = await outcome(second, confirm(replacement.value));
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.value.estado, 'confirmado');
  assert.equal(confirmed.value.version, 2);
  results.push({ case: 'confirmation waiting behind new import rejects old id; latest id confirms', pass: true });
  console.log(JSON.stringify({ postgres: '17.9', isolation: 'READ COMMITTED', syntheticOrganization: org, cases: results }, null, 2));
} finally {
  for (const session of sessions) await session.close();
}

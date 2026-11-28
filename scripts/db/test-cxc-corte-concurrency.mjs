import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

assert.equal(process.env.CXC_CORTE_LOCAL, "1", "Run only against a disposable PostgreSQL database.");
assert.equal(process.env.PGHOST, "127.0.0.1", "Only a loopback database is supported.");
const env = { ...process.env, PGHOSTADDR: "127.0.0.1", PGSSLMODE: "disable", PGCONNECT_TIMEOUT: "5" };
for (const key of ["PGSERVICE", "PGSERVICEFILE", "DATABASE_URL", "SUPABASE_DB_URL"]) delete env[key];
const psql = process.env.PSQL || "psql";
const args = ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
const org = randomUUID(), contador = randomUUID(), cliente = randomUUID(), factura = randomUUID();
const request = randomUUID();
const label = `cxc_corte_${request.slice(0, 8)}`;
const fecha = "(date_trunc('month',public.fecha_negocio_mx())::date-1)";

function scalar(sql) {
  return execFileSync(psql, args, { env, encoding: "utf8", input: sql + ";\n", timeout: 10_000 }).trim();
}

function session(name) {
  const child = spawn(psql, args, { env: { ...env, PGAPPNAME: name }, stdio: ["pipe", "pipe", "pipe"] });
  let output = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const result = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output, stderr }));
  });
  return { child, result, output: () => output };
}

async function until(check, description) {
  const deadline = Date.now() + 8000;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(description);
    await delay(40);
  }
}

const auth = `SET LOCAL request.jwt.claims = '{"sub":"${contador}","role":"authenticated"}'; SET LOCAL ROLE authenticated;`;
scalar(`
  INSERT INTO public.organizations(id,nombre) VALUES('${org}','QA cierre concurrente');
  INSERT INTO auth.users(id,email) VALUES('${contador}','${label}@example.invalid');
  INSERT INTO public.organization_members(organization_id,user_id,role)
    VALUES('${org}','${contador}','contador');
  INSERT INTO public.clientes(id,organization_id,nombre,email) VALUES('${cliente}','${org}','QA cartera','${label}@example.invalid');
  BEGIN; ${auth}
  SELECT public.activar_historial_cxc('${org}','Apertura QA conciliada');
  COMMIT;
  UPDATE public.cxc_aperturas SET desde=${fecha}-10 WHERE organization_id='${org}'
`);
const huella = scalar(`BEGIN; ${auth}
  SELECT public.previsualizar_corte_cxc('${org}',${fecha})->>'fingerprint'; ROLLBACK`);
assert.match(huella, /^[0-9a-f]{64}$/);

const writer = session(label + "_writer");
const cert = session(label + "_cert");
const closeFirst = session(label + "_close_first");
const postSecond = session(label + "_post_second");
try {
  writer.child.stdin.write(`BEGIN;
    INSERT INTO public.facturas(id,organization_id,cliente_id,cliente_nombre,numero,fecha_emision,moneda,subtotal,iva,total,tipo_cambio,estado,metodo_pago)
    VALUES('${factura}','${org}','${cliente}','QA cartera','QA-CXC',${fecha},'MXN',100,0,100,1,'Emitida','PUE');
    SELECT 'escritura_lista';\n`);
  await until(() => writer.output().includes("escritura_lista"), "The invoice did not reach the transaction gate.");
  cert.child.stdin.end(`BEGIN; SET LOCAL statement_timeout='9s'; ${auth}
    SELECT public.certificar_corte_cxc('${org}',${fecha},'${huella}','Auxiliar conciliado QA','${request}');
    COMMIT;\n`);
  await until(() => scalar(`
    SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='${label}_cert' AND wait_event_type='Lock')
  `) === "t", "Certification did not wait for the concurrent posting.");
  writer.child.stdin.end("COMMIT;\n");
  assert.equal((await writer.result).code, 0);
  const rejected = await cert.result;
  assert.notEqual(rejected.code, 0);
  assert.match(rejected.stderr, /La cartera cambió desde la vista previa/);
  assert.equal(scalar(`SELECT count(*) FROM public.cxc_cortes WHERE organization_id='${org}'`), "0");
  const final = scalar(`BEGIN; ${auth}
    SELECT public.certificar_corte_cxc('${org}',${fecha}, public.previsualizar_corte_cxc('${org}',${fecha})->>'fingerprint',
      'Auxiliar actualizado QA','${request}');
    SELECT public.consultar_corte_cxc('${org}',${fecha})#>>'{filas,0,saldo}';
    COMMIT`);
  assert.equal(Number(final.split(/\r?\n/).at(-1)), 100);
  scalar(`BEGIN; ${auth} SELECT public.actualizar_cierre_periodo('${org}',${fecha}-1,'Reapertura QA para recertificación'); COMMIT`);
  closeFirst.child.stdin.write(`BEGIN; ${auth}
    SELECT public.certificar_corte_cxc('${org}',${fecha}, public.previsualizar_corte_cxc('${org}',${fecha})->>'fingerprint',
      'Segundo cierre QA','${randomUUID()}');
    SELECT 'cierre_listo';\n`);
  await until(() => closeFirst.output().includes("cierre_listo"), "The closing transaction did not reach its gate.");
  postSecond.child.stdin.end(`SET statement_timeout='9s';
    INSERT INTO public.facturas(id,organization_id,cliente_id,cliente_nombre,numero,fecha_emision,moneda,subtotal,iva,total,tipo_cambio,estado,metodo_pago)
    VALUES('${randomUUID()}','${org}','${cliente}','QA cartera','QA-CXC-TARDE',${fecha},'MXN',100,0,100,1,'Emitida','PUE');\n`);
  await until(() => scalar(`
    SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='${label}_post_second' AND wait_event_type='Lock')
  `) === "t", "The invoice did not wait for the concurrent closing.");
  closeFirst.child.stdin.end("COMMIT;\n");
  assert.equal((await closeFirst.result).code, 0);
  const late = await postSecond.result;
  assert.notEqual(late.code, 0);
  assert.match(late.stderr, /LC_PERIODO_CERRADO/);
  assert.equal(scalar(`SELECT count(*) FROM public.facturas WHERE organization_id='${org}'`), "1");
  console.log("CxC concurrente: se rechazaron la vista previa obsoleta y el registro tardío en un periodo recién cerrado.");
} finally {
  for (const { child } of [writer, cert, closeFirst, postSecond]) {
    if (child.exitCode === null) child.kill();
  }
}

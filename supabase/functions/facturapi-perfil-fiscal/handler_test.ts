import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { crearHandler, parseBody } from "./handler.ts";
import { PerfilFiscalError } from "./proveedor.ts";
const orgId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";

function harness(options: { denied?: boolean; rpcError?: boolean; authError?: boolean } = {}) {
  let syncs = 0; let calls = 0;
  const client = createClient("https://example.invalid", "test-key", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: {
    fetch: () => { calls++; return Promise.resolve(new Response(JSON.stringify(options.rpcError
      ? { code: "42501", message: "internal-details" }
      : { version: 0, perfil: null, estado: "sin_sincronizar", problemas: [], ambiente: "sandbox" }), {
      status: options.rpcError ? 403 : 200, headers: { "Content-Type": "application/json" },
    })); },
  } });
  const handler = crearHandler({
    authenticate: async () => {
      if (options.authError) throw new Error("401:invalid");
      return { userId, authHeader: "Bearer test", adminClient: client, anonClient: client };
    },
    authorizeOrgRole: () => Promise.resolve(!options.denied),
    sincronizarPerfil: (_admin, { orgId: target, ambiente, actor, version }) => {
      assertEquals([target, ambiente, actor, version], [orgId, "sandbox", userId, 0]); syncs++;
      return Promise.resolve();
    },
  });
  const request = () => handler(new Request("https://local.test/perfil", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organization_id: orgId, ambiente: "sandbox", accion: "sincronizar", regimen_fiscal: "626", p_actor: "spoof" }),
  }));
  return { request, counts: () => [syncs, calls] };
}
Deno.test("sin sesión o rol no consulta credenciales, SQL ni proveedor", async () => {
  for (const [options, status] of [[{ authError: true }, 401], [{ denied: true }, 403]] as const) {
    const test = harness(options); assertEquals((await test.request()).status, status); assertEquals(test.counts(), [0, 0]);
  }
});
Deno.test("el rechazo de organización activa en SQL bloquea la sincronización", async () => {
  const test = harness({ rpcError: true }); const res = await test.request();
  assertEquals(res.status, 403); assertEquals(test.counts(), [0, 1]);
  assertEquals((await res.text()).includes("internal-details"), false);
});
Deno.test("usa actor autenticado y solo relee tras persistir", async () => {
  const test = harness(); assertEquals((await test.request()).status, 200); assertEquals(test.counts(), [1, 2]);
});
Deno.test("ignora datos de perfil y actor aportados por el navegador", () => {
  assertEquals(parseBody({ organization_id: orgId, ambiente: "live", accion: "sincronizar", rfc: "spoof", actor: "spoof" }),
    { organization_id: orgId, ambiente: "live", accion: "sincronizar", perfil_id: undefined, vigente_desde: null });
});

Deno.test("valida calendario real antes de confirmar, incluidos bisiestos y límites", () => {
  const body = { organization_id: orgId, ambiente: "sandbox", accion: "confirmar", perfil_id: userId };
  for (const vigente_desde of ["2025-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-10", "0000-01-01", "2026-01-00", "2026-01-01T00:00:00Z"]) {
    const error = assertThrows(() => parseBody({ ...body, vigente_desde }), PerfilFiscalError);
    assertEquals(error.status, 400);
  }
  for (const vigente_desde of ["2024-02-29", "2026-04-30", "0001-01-01", null]) {
    assertEquals(parseBody({ ...body, vigente_desde }).vigente_desde, vigente_desde);
  }
});

Deno.test("un conflicto concurrente no relee ni responde éxito y no filtra detalles", async () => {
  let reads = 0;
  const client = createClient("https://example.invalid", "test-key", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: () => {
    reads++;
    return Promise.resolve(new Response(JSON.stringify({ version: 1 }), { headers: { "Content-Type": "application/json" } }));
  } } });
  const handler = crearHandler({
    authenticate: () => Promise.resolve({ userId, authHeader: "Bearer fixture", adminClient: client, anonClient: client }),
    authorizeOrgRole: () => Promise.resolve(true),
    sincronizarPerfil: () => Promise.reject(new PerfilFiscalError(409, "perfil_cambio", "Recarga y sincroniza nuevamente.")),
  });
  const response = await handler(new Request("https://local.test", { method: "POST", body: JSON.stringify({
    organization_id: orgId, ambiente: "sandbox", accion: "sincronizar",
  }) }));
  assertEquals(response.status, 409);
  assertEquals(reads, 1);
});

function handlerConError(error: unknown, reportar: Parameters<typeof crearHandler>[1]) {
  return crearHandler({
    authenticate: () => Promise.reject(error),
    authorizeOrgRole: () => Promise.resolve(false),
    sincronizarPerfil: () => Promise.resolve(),
  }, reportar);
}

Deno.test("reporta fallos 5xx sin datos originales y conserva respuesta si falla telemetría", async () => {
  for (const [error, status] of [[new Error("sensitive-provider-body"), 503],
    [new DOMException("sensitive-timeout", "TimeoutError"), 504]] as const) {
    let reports = 0;
    const handler = handlerConError(error, (reported, context) => {
      reports++;
      assertEquals(reported instanceof Error && reported.message, `perfil_fiscal_http_${status}`);
      assertEquals(reported instanceof Error && reported.cause, undefined);
      assertEquals(context, { fn: "facturapi-perfil-fiscal", status_code: status });
      return Promise.reject(new Error("telemetry unavailable"));
    });
    const response = await handler(new Request("https://local.test", { method: "POST" }));
    assertEquals(response.status, status);
    assertEquals((await response.text()).includes("sensitive"), false);
    assertEquals(reports, 1);
  }
});

Deno.test("errores esperados de autorización y conflicto no generan eventos Sentry", async () => {
  for (const error of [new Error("401:invalid"), new PerfilFiscalError(403, "sin_permiso", "Sin permiso"),
    new PerfilFiscalError(409, "perfil_cambio", "Recarga")]) {
    let reports = 0;
    const handler = handlerConError(error, () => { reports++; return Promise.resolve(); });
    const response = await handler(new Request("https://local.test", { method: "POST" }));
    assertEquals(response.status < 500, true);
    assertEquals(reports, 0);
  }
});

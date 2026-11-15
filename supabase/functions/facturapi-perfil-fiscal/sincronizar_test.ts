import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { sincronizarPerfil } from "./sincronizar.ts";
import { PerfilFiscalError } from "./proveedor.ts";

function cliente(options: { readError?: boolean; saveError?: boolean } = {}) {
  const writes: unknown[] = [];
  const admin = createClient("https://example.invalid", "test-key", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: {
    fetch: async (input, init) => {
      const rpc = String(input).includes("/rpc/");
      if (rpc) writes.push(JSON.parse(String(init?.body)));
      const failed = rpc ? options.saveError : options.readError;
      return new Response(JSON.stringify(failed ? { code: rpc ? "40001" : "XX000", message: "internal" } : rpc ? "saved-id" : {
        updated_at: "2026-11-13T12:00:00Z", facturapi_org_id: "org-provider",
        api_key_sandbox_vault_id: null, api_key_live_vault_id: null,
        api_key_sandbox_secret_name: "PERFIL_QA_TEST_KEY", api_key_live_secret_name: "PERFIL_QA_LIVE_KEY",
      }), { status: failed ? 409 : 200, headers: { "Content-Type": "application/json" } });
    },
  } });
  return { admin, writes };
}
const perfil = { facturapi_org_id: "org-provider", rfc: "GODE561231GR8", razon_social: "QA", regimen_fiscal: "626", codigo_postal: "01000" };

Deno.test("sincroniza con la llave del ambiente solicitado y registra la procedencia", async () => {
  Deno.env.set("PERFIL_QA_TEST_KEY", "sk_test_fixture"); Deno.env.set("PERFIL_QA_LIVE_KEY", "sk_live_fixture");
  try {
    for (const ambiente of ["sandbox", "live"] as const) {
      const { admin, writes } = cliente();
      await sincronizarPerfil(admin, { orgId: "org-a", ambiente, actor: "actor-a", version: 2 }, (key) => {
        assertEquals(key, ambiente === "live" ? "sk_live_fixture" : "sk_test_fixture"); return Promise.resolve(perfil);
      });
      assertEquals(writes, [{ p_org_id: "org-a", p_ambiente: ambiente, p_actor: "actor-a",
        p_credenciales_actualizadas_at: "2026-11-13T12:00:00Z", p_version_esperada: 2, p_datos: perfil }]);
    }
  } finally { Deno.env.delete("PERFIL_QA_TEST_KEY"); Deno.env.delete("PERFIL_QA_LIVE_KEY"); }
});
Deno.test("una llave de otro ambiente bloquea la consulta del proveedor", async () => {
  Deno.env.set("PERFIL_QA_TEST_KEY", "sk_live_fixture");
  try {
    let requests = 0;
    const error = await assertRejects(() => sincronizarPerfil(cliente().admin, { orgId: "org", ambiente: "sandbox", actor: "actor", version: 0 },
      () => { requests++; return Promise.resolve(perfil); }), PerfilFiscalError);
    assertEquals(error.status, 412); assertEquals(requests, 0);
  } finally { Deno.env.delete("PERFIL_QA_TEST_KEY"); }
});
Deno.test("fallo al leer credenciales no llama al proveedor", async () => {
  let requests = 0;
  await assertRejects(() => sincronizarPerfil(cliente({ readError: true }).admin, { orgId: "org", ambiente: "live", actor: "actor", version: 0 },
    () => { requests++; return Promise.resolve(perfil); }), PerfilFiscalError);
  assertEquals(requests, 0);
});
Deno.test("un conflicto al persistir no se presenta como sincronización exitosa", async () => {
  Deno.env.set("PERFIL_QA_TEST_KEY", "sk_test_fixture");
  try {
    const error = await assertRejects(() => sincronizarPerfil(cliente({ saveError: true }).admin, { orgId: "org", ambiente: "sandbox", actor: "actor", version: 0 },
      () => Promise.resolve(perfil)), PerfilFiscalError);
    assertEquals(error.status, 409);
  } finally { Deno.env.delete("PERFIL_QA_TEST_KEY"); }
});

Deno.test("cada organización resuelve su propia llave sin reutilizar la de otro emisor", async () => {
  const secrets: Record<string, string> = { "org-a": "PERFIL_QA_ORG_A", "org-b": "PERFIL_QA_ORG_B" };
  Deno.env.set(secrets["org-a"], "sk_test_emisor_a");
  Deno.env.set(secrets["org-b"], "sk_test_emisor_b");
  const writes: string[] = [];
  const admin = createClient("https://example.invalid", "test-key", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: {
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/rpc/registrar_perfil_fiscal_emisor")) {
        writes.push(JSON.parse(String(init?.body)).p_org_id);
        return new Response(JSON.stringify("saved-id"), { headers: { "Content-Type": "application/json" } });
      }
      const org = url.searchParams.get("organization_id")?.replace(/^eq\./, "") ?? "";
      assertEquals(org in secrets, true);
      return new Response(JSON.stringify({ updated_at: "2026-11-13T12:00:00Z", facturapi_org_id: org,
        api_key_sandbox_vault_id: null, api_key_live_vault_id: null,
        api_key_sandbox_secret_name: secrets[org], api_key_live_secret_name: null,
      }), { headers: { "Content-Type": "application/json" } });
    },
  } });
  try {
    await Promise.all([["org-a", "sk_test_emisor_a"], ["org-b", "sk_test_emisor_b"]].map(async ([org, key]) => {
      await sincronizarPerfil(admin, { orgId: org, ambiente: "sandbox", actor: "actor", version: 0 }, (actual) => {
        assertEquals(actual, key); return Promise.resolve({ ...perfil, facturapi_org_id: org });
      });
    }));
    assertEquals(writes.sort(), ["org-a", "org-b"]);
  } finally { Object.values(secrets).forEach((secret) => Deno.env.delete(secret)); }
});

Deno.test("respuestas concurrentes usan versión esperada: sólo una se acepta", async () => {
  Deno.env.set("PERFIL_QA_RACE_KEY", "sk_test_race_fixture");
  let version = 0; let providerCalls = 0; let saves = 0;
  const admin = createClient("https://example.invalid", "test-key", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: {
    fetch: (input, init) => {
      if (String(input).includes("/rpc/registrar_perfil_fiscal_emisor")) {
        const payload = JSON.parse(String(init?.body));
        assertEquals(payload.p_credenciales_actualizadas_at, "2026-11-13T12:00:00Z");
        const conflict = payload.p_version_esperada !== version;
        if (!conflict) { version++; saves++; }
        return Promise.resolve(new Response(JSON.stringify(conflict ? { code: "40001", message: "version changed" } : "saved-id"),
          { status: conflict ? 409 : 200, headers: { "Content-Type": "application/json" } }));
      }
      return Promise.resolve(new Response(JSON.stringify({ updated_at: "2026-11-13T12:00:00Z", facturapi_org_id: "org-provider",
        api_key_sandbox_vault_id: null, api_key_live_vault_id: null,
        api_key_sandbox_secret_name: "PERFIL_QA_RACE_KEY", api_key_live_secret_name: null,
      }), { headers: { "Content-Type": "application/json" } }));
    },
  } });
  try {
    const provider = () => { providerCalls++; return Promise.resolve(perfil); };
    const results = await Promise.allSettled([
      sincronizarPerfil(admin, { orgId: "org-a", ambiente: "sandbox", actor: "actor-a", version: 0 }, provider),
      sincronizarPerfil(admin, { orgId: "org-a", ambiente: "sandbox", actor: "actor-a", version: 0 }, provider),
    ]);
    assertEquals(providerCalls, 2); assertEquals(saves, 1);
    assertEquals(results.filter((r) => r.status === "fulfilled").length, 1);
    const rejected = results.find((r) => r.status === "rejected");
    assertEquals(rejected?.status === "rejected" && rejected.reason instanceof PerfilFiscalError && rejected.reason.status, 409);
  } finally { Deno.env.delete("PERFIL_QA_RACE_KEY"); }
});

Deno.test("rotación durante la consulta conserva timestamp original y reporta conflicto", async () => {
  Deno.env.set("PERFIL_QA_TEST_KEY", "sk_test_fixture");
  try {
    const { admin, writes } = cliente({ saveError: true });
    let consulted = false;
    const error = await assertRejects(() => sincronizarPerfil(admin, { orgId: "org-a", ambiente: "sandbox", actor: "actor-a", version: 7 }, () => {
      consulted = true;
      return Promise.resolve(perfil);
    }), PerfilFiscalError);
    assertEquals(consulted, true); assertEquals(error.status, 409);
    assertEquals(writes, [{ p_org_id: "org-a", p_ambiente: "sandbox", p_actor: "actor-a",
      p_credenciales_actualizadas_at: "2026-11-13T12:00:00Z", p_version_esperada: 7, p_datos: perfil }]);
  } finally { Deno.env.delete("PERFIL_QA_TEST_KEY"); }
});

import { assertEquals, assertRejects, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { consultarPerfilProveedor, normalizarPerfilProveedor, PerfilFiscalError } from "./proveedor.ts";

Deno.test("importa exclusivamente datos fiscales del objeto legal", () => {
  const result = normalizarPerfilProveedor({ id: "org-test", certificate: { private_key: "no-exportar" },
    legal: { tax_id: " gode561231gr8 ", legal_name: " Emisor ", tax_system: "626", address: { zip: "01000" }, curp: "no-exportar" } });
  assertEquals(result, { facturapi_org_id: "org-test", rfc: "GODE561231GR8", razon_social: "Emisor", regimen_fiscal: "626", codigo_postal: "01000" });
});
Deno.test("datos pendientes se conservan vacíos sin inferir RESICO", () => {
  assertEquals(normalizarPerfilProveedor({ id: "org", legal: { tax_id: "GODE561231GR8" } }).regimen_fiscal, null);
  assertThrows(() => normalizarPerfilProveedor({ legal: {} }), PerfilFiscalError);
  assertThrows(() => normalizarPerfilProveedor({ id: "org", legal: { tax_system: { value: "626" } } }), PerfilFiscalError);
});
Deno.test("consulta la organización autenticada y no sigue redirecciones", async () => {
  const result = await consultarPerfilProveedor("test-only-key", async (url, init) => {
    assertEquals(String(url), "https://www.facturapi.io/v2/organizations/me");
    assertEquals(init?.redirect, "error");
    assertEquals(init?.signal instanceof AbortSignal, true);
    return new Response(JSON.stringify({ id: "org", legal: {} }));
  });
  assertEquals(result.facturapi_org_id, "org");
});
Deno.test("un error externo nunca propaga su body ni secretos", async () => {
  const error = await assertRejects(() => consultarPerfilProveedor("test-only-key", () => Promise.resolve(
    new Response("sensitive-provider-details", { status: 401 }))), PerfilFiscalError);
  assertEquals(error.status, 412);
  assertEquals(error.message.includes("sensitive"), false);
});

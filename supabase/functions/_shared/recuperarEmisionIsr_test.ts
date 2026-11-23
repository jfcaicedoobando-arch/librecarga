import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import { basicAuthHeader } from "./facturapiAuth.ts";
import { consultarIntentoIsr, recuperarEmisionIsr } from "./recuperarEmisionIsr.ts";

function fixture() {
  const organizationId = "librecarga-qa";
  const facturaId = "factura-qa";
  const claim = "PENDING:attempt-qa";
  const apiKey = "sk_test_qa";
  const facturapiOrgId = "org-fapi-qa";
  const llamadas: string[] = [];
  const cred = { ambiente: "live", api_key_sandbox_vault_id: "sandbox-vault-qa", facturapi_org_id: facturapiOrgId };
  const admin = {
    from: () => ({
      select: () => ({
        eq: (columna: string, valor: string) => {
          assertEquals([columna, valor], ["organization_id", organizationId]);
          return { maybeSingle: () => Promise.resolve({ data: cred, error: null }) };
        },
      }),
    }),
    rpc: (fn: string, args: Record<string, unknown>) => {
      llamadas.push(fn);
      if (fn === "obtener_intento_timbrado_isr") {
        assertEquals(args, { p_factura_id: facturaId, p_organization_id: organizationId, p_claim: claim });
        return Promise.resolve({ data: { facturapi_id: "inv-qa", prevalidacion: {
          ambiente: "sandbox", emisor: { facturapi_org_id: facturapiOrgId, rfc: "GODE561231GR8", regimen_fiscal: "626" },
          factura_id: facturaId, organization_id: organizationId,
        } } });
      }
      if (fn === "get_facturapi_api_key_internal") {
        assertEquals(args, { p_org_id: organizationId, p_ambiente: "sandbox" });
        return Promise.resolve({ data: apiKey, error: null });
      }
      assertEquals(args.p_estado, "pendiente");
      return Promise.resolve({ data: { estado: "pendiente" }, error: null });
    },
  } as unknown as SupabaseClient;
  return { intento: { admin, facturaId, organizationId, claim }, apiKey, facturapiOrgId, llamadas };
}

Deno.test("recuperación verifica la llave histórica y permite un perfil vigente con RFC diferente", async () => {
  const { intento, apiKey, facturapiOrgId, llamadas } = fixture();
  const guardado = await consultarIntentoIsr(intento, (url, init) => {
    assertEquals(url, "https://www.facturapi.io/v2/organizations/me");
    assertEquals(new Headers(init?.headers).get("Authorization"), basicAuthHeader(apiKey));
    return Promise.resolve(Response.json({ id: facturapiOrgId, legal: { tax_id: "AAA010101AA0" } }));
  });
  assert(guardado);
  assertEquals(guardado.ambiente, "sandbox");
  assertEquals(guardado.esperado.emisor.rfc, "GODE561231GR8");
  assertEquals(llamadas, ["obtener_intento_timbrado_isr", "get_facturapi_api_key_internal"]);
});

Deno.test("recuperación rechaza otra organización y consulta sólo el id del intento vigente", async () => {
  const { intento, facturapiOrgId, llamadas } = fixture();
  assertEquals(await consultarIntentoIsr(intento, () => Promise.resolve(Response.json({ id: "otra-org" }))), null);
  const guardado = await consultarIntentoIsr(intento, () => Promise.resolve(Response.json({ id: facturapiOrgId })));
  assert(guardado);
  const consultados: string[] = [];
  const intentoStub = { ...guardado, client: { invoices: { retrieve: (id: string) => {
    consultados.push(id);
    return Promise.resolve({ id, external_id: intento.claim, livemode: false, status: "pending" });
  } } } };
  assertEquals(await recuperarEmisionIsr(intentoStub, "inv-otro"), null);
  assertEquals((await recuperarEmisionIsr(intentoStub, "inv-qa"))?.estado, "pendiente");
  assertEquals(consultados, ["inv-qa"]);
  assertEquals(llamadas.at(-1), "registrar_resultado_timbrado_isr");
});

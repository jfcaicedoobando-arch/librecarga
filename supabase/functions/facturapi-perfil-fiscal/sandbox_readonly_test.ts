import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verificarSandbox } from "../../../scripts/qa/perfil-fiscal-sandbox-readonly.ts";

Deno.test("sandbox runner rejects missing, live and malformed keys without requests", async () => {
  let calls = 0;
  for (const key of [undefined, "", "sk_live_fixture", "sk_test_", "sk_test_fixture\n"]) {
    const result = await verificarSandbox(key, () => { calls++; throw new Error("must not call"); }, "expected-org");
    assertEquals(result.success, false);
  }
  assertEquals(calls, 0);
});

Deno.test("sandbox runner emits only masked allowlist, never provider identity or raw error", async () => {
  const result = await verificarSandbox("sk_test_fixture", () => Promise.resolve({
    facturapi_org_id: "secret-provider-identity", rfc: "GODE561231GR8", razon_social: "private name",
    regimen_fiscal: "626", codigo_postal: "01000",
  }), "secret-provider-identity");
  assertEquals(result, { ambiente: "sandbox", org_match: true, rfc_masked: "GO*********R8", regimen: "626", tipo_perfil: "fisica", success: true });
  const failed = await verificarSandbox("sk_test_fixture", () => { throw new Error("sk_test_fixture private payload"); }, "expected-org");
  assertEquals(failed, { ambiente: "sandbox", org_match: false, rfc_masked: null, regimen: null, tipo_perfil: "no_identificado", success: false });
});

Deno.test("sandbox requires expected organization and suppresses mismatching profile", async () => {
  let calls = 0;
  const provider = () => {
    calls++;
    return Promise.resolve({ facturapi_org_id: "other-org", rfc: "GODE561231GR8", razon_social: "private",
      regimen_fiscal: "626", codigo_postal: "01000" });
  };
  assertEquals((await verificarSandbox("sk_test_fixture", provider)).success, false);
  assertEquals(calls, 0);
  const result = await verificarSandbox("sk_test_fixture", provider, "expected-org");
  assertEquals(calls, 1);
  assertEquals(result, { ambiente: "sandbox", org_match: false, rfc_masked: null, regimen: null, tipo_perfil: "no_identificado", success: false });
});

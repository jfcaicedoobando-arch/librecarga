/**
 * Run only after sandbox-read authorization. No Supabase calls or persistence.
 * Supply FACTURAPI_SANDBOX_QA_KEY via an approved secret channel, never CLI args.
 * deno run --cached-only --quiet --allow-env=FACTURAPI_SANDBOX_QA_KEY,FACTURAPI_SANDBOX_EXPECTED_ORG_ID
 *   --allow-net=www.facturapi.io scripts/qa/perfil-fiscal-sandbox-readonly.ts
 */
import { consultarPerfilProveedor } from "../../supabase/functions/facturapi-perfil-fiscal/proveedor.ts";

function esLlaveSandbox(key: string | undefined): key is string {
  return !!key && key.trim() === key && /^sk_test_\S+$/.test(key);
}

export async function verificarSandbox(
  key: string | undefined,
  consultar = consultarPerfilProveedor,
  expectedOrgId?: string,
) {
  const failed = { ambiente: "sandbox", org_match: false, rfc_masked: null, regimen: null, tipo_perfil: "no_identificado", success: false };
  // Fail closed before any request; never fall back to a live/global key.
  if (!esLlaveSandbox(key)
    || !expectedOrgId || expectedOrgId.trim() !== expectedOrgId || expectedOrgId.length > 100) return failed;
  try {
    const profile = await consultar(key);
    if (profile.facturapi_org_id !== expectedOrgId) return failed;
    const rfc = profile.rfc ?? "";
    const validRfc = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)
      && !["XAXX010101000", "XEXX010101000"].includes(rfc);
    return {
      ambiente: "sandbox",
      org_match: true,
      rfc_masked: validRfc ? `${rfc.slice(0, 2)}${"*".repeat(rfc.length - 4)}${rfc.slice(-2)}` : null,
      regimen: /^\d{3}$/.test(profile.regimen_fiscal ?? "") ? profile.regimen_fiscal : null,
      tipo_perfil: validRfc ? (rfc.length === 13 ? "fisica" : "moral") : "no_identificado",
      success: true,
    };
  } catch {
    return failed;
  }
}

if (import.meta.main) {
  // Even missing environment permission is reported without a raw exception.
  let key: string | undefined;
  let expectedOrgId: string | undefined;
  try {
    key = Deno.env.get("FACTURAPI_SANDBOX_QA_KEY");
    expectedOrgId = Deno.env.get("FACTURAPI_SANDBOX_EXPECTED_ORG_ID");
  } catch { /* fail closed */ }
  const result = await verificarSandbox(key, consultarPerfilProveedor, expectedOrgId);
  console.log(JSON.stringify(result));
  if (!result.success) Deno.exitCode = 1;
}

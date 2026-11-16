import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validarFiscalEnvio, totalesFiscalesCorreo, rutaPdfFiscal } from "./fiscalEnvio.ts";
import { handleSend, handlePrepare } from "./handlers.ts";
import type { AdminClient, Cotizacion } from "./sendHelpers.ts";

const fingerprint = "a".repeat(32);
const cot: Cotizacion = { id: "cot", folio: "COT-1", organization_id: "org", cliente_id: null,
  cliente_nombre: "QA", origen: "", destino: "", incoterm: "", modo: "", fecha_vigencia: null, estado: "Borrador" };
const fiscal = { schema_version: "cotizacion_fiscal_v1", estado: "confirmado", organization_id: "org", cliente_id: null,
  conceptos_fingerprint: fingerprint, bloques: [{ moneda: "MXN", total: 230.42 }] };

function adminResult(data: unknown, error: { code: string } | null = null) {
  const calls: unknown[] = [];
  const chain = { eq: () => chain, maybeSingle: () => Promise.resolve({ data: { role: "admin" } }) };
  // SAFE-CAST: structural fake implements only the authorization/RPC boundary;
  // storage or provider access would throw, ensuring rejection precedes I/O.
  const admin = { from: () => ({ select: () => chain }), rpc: (name: string, args: unknown) => {
    calls.push({ name, args }); return Promise.resolve({ data, error });
  } } as unknown as AdminClient;
  return { admin, calls };
}

Deno.test("fiscal email: RPC actor and fingerprint bind canonical totals", async () => {
  const { admin, calls } = adminResult(fiscal);
  const result = await validarFiscalEnvio(admin, cot, "actor", fingerprint, {});
  if (result instanceof Response || !result.fiscal) throw new Error("Expected approved snapshot");
  assertEquals(totalesFiscalesCorreo(result.fiscal), { mxn: "MXN 230.42" });
  assertEquals(calls, [{ name: "validar_cotizacion_fiscal_envio", args: {
    p_cotizacion_id: "cot", p_expected_fingerprint: fingerprint, p_usuario_id: "actor",
  } }]);
  assertEquals(rutaPdfFiscal("org/cot/file.pdf", fingerprint), `org/cot/fiscal-${fingerprint}-file.pdf`);
});

for (const data of [{ ...fiscal, organization_id: "other" }, { ...fiscal, cliente_id: "other" },
  { ...fiscal, conceptos_fingerprint: "b".repeat(32) }, { ...fiscal, estado: "pendiente" }]) {
  Deno.test(`fiscal email: rejects changed snapshot ${JSON.stringify(data)}`, async () => {
    const result = await validarFiscalEnvio(adminResult(data).admin, cot, "actor", fingerprint, {});
    assertEquals(result instanceof Response && result.status, 409);
  });
}

Deno.test("fiscal email: legacy only accepts absent expected fingerprint", async () => {
  assertEquals(await validarFiscalEnvio(adminResult(null).admin, cot, "actor", null, {}), { fiscal: null });
  const result = await validarFiscalEnvio(adminResult(null).admin, cot, "actor", fingerprint, {});
  assertEquals(result instanceof Response && result.status, 409);
});

Deno.test("send: marcar_enviada false and forged totals cannot bypass fiscal rejection", async () => {
  const { admin, calls } = adminResult(null, { code: "P0001" });
  const response = await handleSend({ admin, cot, userId: "actor", userEmail: "qa@example.test", timestamp: 1,
    supabaseUrl: "https://example.test", supabaseServiceKey: "synthetic", cors: {},
    body: { destinatarios: [{ email: "qa@example.test" }], marcar_enviada: false, totales: { mxn: "0.01" }, fiscal_fingerprint: fingerprint } });
  assertEquals(response.status, 409);
  assertEquals(calls.length, 1);
});

Deno.test("prepare: pending review rejected before signed upload", async () => {
  const response = await handlePrepare(adminResult(null, { code: "P0001" }).admin, "org/cot/file.pdf", {}, "actor",
    { cot, expectedFingerprint: fingerprint });
  assertEquals(response.status, 409);
});

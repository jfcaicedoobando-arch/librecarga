import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { emitirRepIsr } from "./emitirIsr.ts";
import type { PagoContext } from "./helpers.ts";

const facturaUuid = "2D4D13C5-7DE2-42F1-A9A7-F824D50CDF88";
const claim = "PENDING:rep-qa";
const ctx: PagoContext = {
  receptor: { legal_name: "EMPRESA QA", tax_id: "EKU9003173C9", tax_system: "601", address: { zip: "01010" } },
  monto: 2, moneda: "USD", tipo_cambio: 20, forma_pago: "03", fecha_pago: "2026-11-15",
  documento_relacionado: {
    uuid: facturaUuid, moneda_dr: "MXN", metodo_pago: "PPD", tipo_cambio_dr: 1,
    num_parcialidad: 2, imp_saldo_ant: 94.65, imp_pagado: 40, imp_saldo_insoluto: 54.65,
    tasa_iva: 0.16, grupos_iva: [{ tasa: 0.16, factor: "Tasa", importe: 200.8 }],
    retenciones: [{ tipo: "ISR", tasa: 0.0125, importe: 200.8 }, { tipo: "IVA", tasa: 0.04, importe: 200.8 }],
    subtotal_factura: 200.8, total_factura: 222.39,
  },
};
const org = "org-facturapi-qa";
const resumen = {
  uuid: facturaUuid.toLowerCase(), currency: "MXN", total: 222.39, amount: 40, installment: 2, last_balance: 94.65,
  taxes: [{ type: "IVA", factor: "Tasa", rate: 0.16, base: 36.1168 },
    { type: "ISR", factor: "Tasa", rate: 0.0125, base: 36.1168, withholding: true },
    { type: "IVA", factor: "Tasa", rate: 0.04, base: 36.1168, withholding: true }],
};

function caso(respuestaResumen = resumen) {
  const llamados: Array<{ op: string; datos: Record<string, unknown> }> = [];
  const admin = { rpc: (op: string, datos: Record<string, unknown>) => {
    llamados.push({ op, datos });
    return Promise.resolve({ data: op === "reservar_rep_isr" ? { claim } : { estado: "pendiente" }, error: null });
  } } as unknown as SupabaseClient;
  const args: Parameters<typeof emitirRepIsr>[0] = {
    rep: { admin, pagoId: "pago-qa", organizationId: "org-qa" }, actor: "actor-qa", updatedAt: "2026-11-15T12:00:00.000Z",
    ctx, facturaRemota: "inv-qa", origen: {
      ambiente: "sandbox", emisor: { facturapiOrgId: org, rfc: "GODE561231GR8", regimen: "626", cp: "01000" },
      receptor: { id: "cliente-qa", nombre: "EMPRESA QA", rfc: "EKU9003173C9", regimen_fiscal: "601", codigo_postal: "01010" },
    },
    facturapi: { ambiente: "sandbox", apiKey: "sk_test_ficticia", client: { invoices: {
      paymentSummary: (id: string, params: { amount: number }) => {
        llamados.push({ op: "resumen", datos: { id, ...params } });
        return Promise.resolve(respuestaResumen);
      },
      create: (datos: Record<string, unknown>) => {
        llamados.push({ op: "crear", datos });
        return Promise.resolve({ id: "rep-qa-remoto", external_id: claim, status: "pending", type: "P", livemode: false });
      },
    } } },
    json: (body, status) => Response.json(body, { status }),
  };
  return { args, llamados };
}

Deno.test("REP RESICO conserva las bases del proveedor y congela el mismo intento al quedar pendiente", async () => {
  const { args, llamados } = caso();
  const respuesta = await emitirRepIsr(args);
  assertEquals(respuesta.status, 202);
  assertEquals(llamados.map((c) => c.op), ["resumen", "reservar_rep_isr", "crear", "registrar_resultado_rep_isr"]);
  assertEquals(llamados[0].datos, { id: "inv-qa", amount: 40 });
  const snapshot = llamados[1].datos.p_esperado as { pago: { monto: number }; documento: { equivalencia: number; impuestos: unknown } };
  assertEquals([snapshot.pago.monto, snapshot.documento.equivalencia], [2, 20]);
  const enviado = llamados[2].datos as unknown as {
    idempotency_key: string; external_id: string; complements: [{ data: [{ related_documents: [{ taxes: unknown }] }] }];
  };
  assertEquals([enviado.idempotency_key, enviado.external_id, llamados[3].datos.p_estado], [claim, claim, "pendiente"]);
  assertEquals(enviado.complements[0].data[0].related_documents[0].taxes, snapshot.documento.impuestos);
  assertEquals((snapshot.documento.impuestos as Array<{ base: number }>).map((g) => g.base), [36.1168, 36.1168, 36.1168]);
});

Deno.test("REP RESICO detiene la emisión ante UUID, parcialidad, saldo o impuestos discordantes", async () => {
  for (const alterado of [
    { uuid: "UUID-ajeno" }, { installment: 3 }, { last_balance: 94.64 }, { taxes: [] },
    { taxes: resumen.taxes.map((t) => ({ ...t, base: 25 })) },
  ]) {
    const { args, llamados } = caso({ ...resumen, ...alterado });
    assertEquals((await emitirRepIsr(args)).status, 422);
    assertEquals(llamados.map((c) => c.op), ["resumen"]);
  }
});

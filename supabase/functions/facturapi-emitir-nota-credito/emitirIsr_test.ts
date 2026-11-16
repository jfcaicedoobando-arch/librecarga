import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { claim, dbNotaFiscal, esperado, facturaUuid, notaId, org, remoto, uuid, xml } from "../_shared/notaCreditoIsr_test_support.ts";
import { emitirNotaCreditoIsr } from "./emitirIsr.ts";
import type { NotaCreditoContext } from "./helpers.ts";

function preparar(status?: number, comprobante = remoto) {
  const { admin, llamadas, resultados } = dbNotaFiscal();
  const args = {
    nota: { admin, notaId, organizationId: org }, actor: "actor-qa", updatedAt: "2026-11-15T20:23:04.000001+00:00",
    facturapi: { apiKey: "llave-qa", ambiente: "sandbox" as const, facturapiOrgId: esperado.emisor.facturapi_org_id,
      client: { invoices: { create: (payload: Record<string, unknown>) => {
        llamadas.push("crear");
        assertEquals(payload.type, "E");
        assertEquals(payload.series, "NC");
        assertEquals(payload.related_documents, [{ relationship: "01", documents: [facturaUuid] }]);
        assertEquals([payload.external_id, payload.idempotency_key], [claim, claim]);
        return status ? Promise.reject({ status, message: "Fallo simulado" }) : Promise.resolve(comprobante);
      } } } },
    ctx: { serie: "NC", uso_cfdi: "G02", forma_pago: "15", moneda: "MXN", tipo_cambio: 1,
      uuid_factura_relacionada: facturaUuid,
      receptor: { tax_id: esperado.receptor.rfc, legal_name: "RECEPTOR QA", tax_system: "601", address: { zip: "01010" } },
      conceptos: [{ descripcion: "Bonificación", cantidad: 2, precio_unitario: 100.4, tipo_iva: "gravado_16",
        tasa_iva: .16, tasa_ret_isr: .0125, tasa_ret_iva: .04 }],
    } satisfies NotaCreditoContext,
    json: (body: unknown, status = 200) => Response.json(body, { status }),
  };
  return { args, llamadas, resultados };
}

Deno.test("NC fiscal confirma el egreso de $222.39 una sola vez después de respaldar el XML", async () => {
  const { args, llamadas, resultados } = preparar();
  const resp = await emitirNotaCreditoIsr(args, (url) => {
    assertEquals(url, "https://www.facturapi.io/v2/invoices/nc-remota-qa/xml");
    llamadas.push("xml");
    return Promise.resolve(new Response(xml));
  });
  assertEquals(resp.status, 200);
  assertEquals((await resp.json()).uuid, uuid);
  assertEquals(llamadas, ["reservar_nota_credito_isr", "crear", "xml", `${org}/notas-credito/${uuid}.xml`,
    "registrar_resultado_nota_credito_isr"]);
  assertEquals(resultados[0].p_estado, "confirmado");
});

Deno.test("NC fiscal retiene la reserva si el XML refiere otra factura o la respuesta es incierta", async () => {
  const { args, resultados } = preparar();
  const resp = await emitirNotaCreditoIsr(args, () => Promise.resolve(new Response(xml.replace(facturaUuid, uuid))));
  assertEquals(resp.status, 202);
  assertEquals(resultados[0].p_estado, "conciliacion");
  const otraTasa = preparar();
  assertEquals((await emitirNotaCreditoIsr(otraTasa.args,
    () => Promise.resolve(new Response(xml.replace("0.040000", "0.080000"))))).status, 202);
  assertEquals(otraTasa.resultados[0].p_estado, "conciliacion");
  for (const status of [409, 500]) {
    const fallo = preparar(status);
    assertEquals((await emitirNotaCreditoIsr(fallo.args)).status, 202);
    assertEquals(fallo.resultados[0].p_estado, "pendiente");
  }
  const rechazado = preparar(422);
  assertEquals((await emitirNotaCreditoIsr(rechazado.args)).status, 422);
  assertEquals(rechazado.resultados[0].p_estado, "rechazado");
});

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { claim, dbNotaFiscal, notaId, org, remoto, xml } from "../_shared/notaCreditoIsr_test_support.ts";
import { recuperarNotaIsr } from "./recuperarNotaIsr.ts";

const nc = { id: notaId, organization_id: org, facturapi_id: claim,
  facturapi_claim_at: "2026-11-15T20:00:00Z", serie: "NC", folio: "BORRADOR" };

Deno.test("recupera una nota fiscal después de perder la respuesta usando el mismo intento", async () => {
  const { admin, llamadas, resultados } = dbNotaFiscal();
  const resp = await recuperarNotaIsr(admin, nc, claim, () => Promise.resolve(new Response(xml)), (_admin, local, esperado) => {
    assertEquals([local, esperado.ambiente], [org, "sandbox"]);
    return Promise.resolve({ apiKey: "qa", ambiente: "sandbox", facturapiOrgId: esperado.emisor.facturapi_org_id,
      client: { invoices: { list: () => Promise.resolve({ data: [remoto], total_pages: 1 }),
        retrieve: (id: string) => { assertEquals(id, remoto.id); return Promise.resolve(remoto); } } },
    });
  });
  assert(resp);
  assertEquals((await resp.json()).outcome, "promovido");
  assertEquals(resultados[0].p_estado, "confirmado");
  assertEquals(llamadas[0], "obtener_intento_nota_credito_isr");
});

Deno.test("una consulta vacía de Facturapi no libera la reserva de la nota fiscal", async () => {
  const { admin, resultados } = dbNotaFiscal();
  const resp = await recuperarNotaIsr(admin, nc, claim, undefined, () =>
    Promise.resolve({ apiKey: "qa", ambiente: "sandbox", facturapiOrgId: "pac-qa",
      client: { invoices: { list: () => Promise.resolve({ data: [], total_pages: 1 }) } } }));
  assert(resp);
  assertEquals((await resp.json()).outcome, "timbrado_pendiente");
  assertEquals(resultados, []);
});

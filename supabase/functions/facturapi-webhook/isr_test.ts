import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import { despacharEvento } from "../_shared/facturapi-webhook/despachar.ts";

const facturapiId = "inv-qa";
const claim = "PENDING:intento-qa";
const uuid = "5f9c1c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const org = "librecarga-qa";
const fila = { id: "factura-qa", organization_id: org, estado: "Borrador", evaluacion_fiscal: {},
  facturapi_id: claim, facturapi_pendiente_id: facturapiId, updated_at: "2026-11-15T18:00:00+00:00" };

function fakeDb(factura: Record<string, unknown>): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: (col: string, valor: string) => ({
          eq: (_: string, orgId: string) => ({
            is: () => ({
              maybeSingle: () => Promise.resolve({ data: factura[col] === valor && factura.organization_id === orgId ? factura : null }),
            }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

Deno.test("el webhook ISR sólo despierta la conciliación, aun con una notificación reducida", async () => {
  let conciliaciones = 0;
  for (const object of [{ id: facturapiId }, { id: facturapiId, status: "valid", uuid, external_id: claim }]) {
    const resultado = await despacharEvento(fakeDb(fila), org, { type: "invoice.status_updated", data: { object } },
      (_db, orgId, facturaId, intento, { remoteId }) => {
        assertEquals([orgId, facturaId, intento, remoteId], [org, fila.id, claim, facturapiId]);
        conciliaciones++;
        return Promise.resolve({ estado: "reintentar", motivo: "timbrado_isr_pendiente" });
      });
    assertEquals(resultado, { estado: "reintentar", motivo: "timbrado_isr_pendiente" });
  }
  assertEquals(conciliaciones, 2);
});

Deno.test("el webhook ISR jamás adopta un recurso de otra organización ni modifica un CFDI confirmado", async () => {
  const event = { type: "invoice.status_updated", data: { object: { id: facturapiId, status: "valid", uuid, external_id: claim } } };
  const inesperado = () => { throw new Error("No debe conciliar otro documento"); };
  const cruzado = await despacharEvento(fakeDb(fila), "otra-org", event, inesperado);
  assertEquals(cruzado, { estado: "reintentar", motivo: "pago_not_found" });
  const emitida = { ...fila, ambiente: "sandbox", estado: "Pagada", facturapi_id: facturapiId, facturapi_pendiente_id: null };
  const tardio = await despacharEvento(fakeDb(emitida), org, event, inesperado);
  assertEquals(tardio, { estado: "ignorar", motivo: "estado_ya_avanzado" });
  const cancelado = await despacharEvento(fakeDb(emitida), org,
    { type: event.type, data: { object: { ...event.data.object, status: "canceled" } } }, inesperado);
  assertEquals(cancelado.estado, "aplicar");
  if (cancelado.estado === "aplicar") {
    assertEquals(cancelado.patch.estado, "Cancelada");
    assertEquals(cancelado.patch.uuid_fiscal, undefined);
  }
  const otroAmbiente = await despacharEvento(fakeDb(emitida), org,
    { type: "invoice.canceled", data: event.data, ambiente_firma: "live" }, inesperado);
  assertEquals(otroAmbiente, { estado: "ignorar", motivo: "estado_ya_avanzado" });
});

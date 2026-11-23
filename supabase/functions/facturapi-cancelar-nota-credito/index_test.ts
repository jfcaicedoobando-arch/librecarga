/**
 * Ola 4 · N4 — Invariantes estructurales de facturapi-cancelar-nota-credito.
 * Sin helpers puros en esta carpeta: se valida por inspección de fuente
 * (mismo patrón que facturapi-cancelar/index_test.ts) para no ejecutar
 * Deno.serve ni requerir red.
 */
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { preloadCancelContext } from "./contexto.ts";

const src = (await Promise.all(
  ["./index.ts", "./contexto.ts", "./terminales.ts"].map((p) =>
    Deno.readTextFile(new URL(p, import.meta.url))
  ),
)).join("\n");

Deno.test("N4: substitution usa el facturapi_id (ObjectId) de la NC sustituta, no el UUID SAT", () => {
  assertStringIncludes(src, "sustituyeFacturapiId");
  assertStringIncludes(src, "cancelPayload.substitution = sustituyeFacturapiId");
  // La resolución busca por uuid_fiscal y toma facturapi_id, nunca al revés.
  assertStringIncludes(src, '.eq("uuid_fiscal", uuidFiscal)');
  assertStringIncludes(src, "return { ok: true, nc, sustituyeFacturapiId: sustituta.facturapiId };");
});

Deno.test("N4: se persiste cancellation_status en todas las ramas (rechazada/pendiente/aceptada)", () => {
  const ocurrencias = src.split("cancellation_status:").length - 1;
  assert(ocurrencias >= 3, "debe fijar cancellation_status en cada rama de resultado");
});

Deno.test("N4: sólo marca estado=Cancelada cuando cancellation_status=accepted", () => {
  const idx = src.indexOf('estado: "Cancelada"');
  assert(idx >= 0);
  const bloque = src.slice(Math.max(0, idx - 400), idx + 200);
  assertStringIncludes(bloque, '"accepted"');
});

function dbCancelacion(reemplazo: "live" | "sandbox", facturapiId = "nc-original") {
  const original = { id: "nota-1", facturapi_id: facturapiId, organization_id: "org-1", ambiente: "sandbox",
    estado: "Timbrada", uuid_fiscal: "uuid-1", deleted_at: null };
  const sustituta = { ...original, id: "nota-2", facturapi_id: "nc-sustituta", ambiente: reemplazo, uuid_fiscal: "uuid-2" };
  return { from: (tabla: string) => {
    let notas = [original, sustituta];
    const query = {
      select: () => query,
      eq: (campo: keyof typeof original, valor: unknown) => {
        notas = notas.filter((n) => n[campo] === valor); return query;
      },
      neq: (campo: keyof typeof original, valor: unknown) => {
        notas = notas.filter((n) => n[campo] !== valor); return query;
      },
      is: (campo: keyof typeof original, valor: unknown) => query.eq(campo, valor),
      in: (campo: keyof typeof original, valores: unknown[]) => {
        notas = notas.filter((n) => valores.includes(n[campo])); return query;
      },
      maybeSingle: () => Promise.resolve({ error: null, data: tabla === "factura_notas_credito"
        ? notas[0] ?? null : tabla === "organization_members" ? { role: "contador" } : null }),
    };
    return query;
  } } as unknown as Parameters<typeof preloadCancelContext>[0];
}

Deno.test("la nota sustituta debe estar timbrada en el ambiente de la original", async () => {
  const body = { nota_credito_id: "nota-1", motivo: "01", sustituye_uuid: "uuid-2" };
  const cruzada = await preloadCancelContext(dbCancelacion("live"), body, "usuario-1");
  assert(!cruzada.ok);
  assertEquals(cruzada.response.status, 422);
  const correcta = await preloadCancelContext(dbCancelacion("sandbox"), body, "usuario-1");
  assert(correcta.ok);
  assertEquals([correcta.nc.ambiente, correcta.sustituyeFacturapiId], ["sandbox", "nc-sustituta"]);
});

Deno.test("una reserva PENDING no se envía a cancelación", async () => {
  const res = await preloadCancelContext(dbCancelacion("sandbox", "PENDING:nota-qa"),
    { nota_credito_id: "nota-1", motivo: "02" }, "usuario-1");
  assert(!res.ok);
  assertEquals((await res.response.json()).error, "no_timbrada");
});

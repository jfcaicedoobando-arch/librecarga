import { expect, it } from "vitest";
import { CotizacionDocument } from "@/pdf/documents/CotizacionDocument";
import { ProformaDocument } from "@/pdf/documents/ProformaDocument";
import { ProformaConsolidadaDocument } from "@/pdf/documents/ProformaConsolidadaDocument";
import { fiscalCotizacionFixture } from "@/test/fixtures/snapshotFiscalCotizacion";
import { concepto, cotizacion, embarque, emisor, proforma } from "./fixtures";
import { inspectPdf } from "./inspectPdf";
import { pdfWordBounds } from "./inspectPdfLayout";

const venta = Array.from({ length: 54 }, (_, index) => concepto(index + 1, {
  descripcion: `FiscalFila${index + 1} servicio de coordinación y entrega`,
  precio_unitario: 100.40, total: 100.40,
}));
const bloques = [{ moneda: "MXN" as const, subtotal: 5421.60, iva: 867.46, ret_isr: 67.77, ret_iva: 0, total: 6221.29 }];
const cotizacionFiscal = {
  ...cotizacion,
  evaluacion_fiscal: fiscalCotizacionFixture({ bloques, organization_id: cotizacion.organization_id, cliente_id: cotizacion.cliente_id }),
  conceptos_venta: venta.map(({ descripcion, cantidad, precio_unitario, total }) => ({
    descripcion, cantidad, precio_unitario, total, moneda: "MXN" as const, unidad_medida: "Servicio",
    aplica_iva: true, tipo_iva: "tasa_16" as const, tasa_iva_aplicada: 0.16,
  })),
};
const proformaFiscal = {
  ...proforma, evaluacion_fiscal: fiscalCotizacionFixture({ bloques, organization_id: proforma.organization_id, cliente_id: proforma.cliente_id }),
  conceptos_fiscales: venta,
};
const proformaConsolidada = {
  ...proformaFiscal, es_consolidada: true,
  evaluacion_fiscal: {
    ...proformaFiscal.evaluacion_fiscal,
    ajustes_consolidacion: [{ moneda: "MXN", anterior: 6221.34, nuevo: 6221.29, diferencia: -0.05 }],
  },
};
const consolidados = venta.map((fila) => ({
  ...fila, proforma_id: proforma.id, iva: 16.064, contenedor: "QA-RESICO", tipo_contenedor: "40HC",
}));

it.each([
  ["cotizacion", <CotizacionDocument cotizacion={cotizacionFiscal} emisor={emisor} />],
  ["proforma", <ProformaDocument proforma={proformaFiscal} embarque={embarque} conceptos={[]} emisor={emisor} />],
  ["consolidada", <ProformaConsolidadaDocument proforma={proformaConsolidada}
    embarque={embarque} conceptosConsolidados={consolidados} emisor={emisor} />],
] as const)("%s multipágina conserva cada renglón y un único total fiscal", async (tipo, documento) => {
  const name = `${tipo}-resico-multipagina`;
  const pdf = await inspectPdf(name, documento);
  expect(pdf.pages).toBeGreaterThan(1);
  expect(pdf.text).toContain("Subtotal MXN 5,421.60 IVA MXN 867.46 ISR retenido −MXN 67.77");
  expect(pdf.text.match(/Total neto MXN 6,221\.29/g)).toHaveLength(1);

  const words = pdfWordBounds(name);
  const filas = words.filter((word) => /^FiscalFila\d+$/.test(word.text));
  expect(filas.map((word) => word.text)).toEqual(venta.map((fila) => fila.descripcion.split(" ")[0]));
  expect(filas.at(-1)!.page).toBeGreaterThan(filas[0].page);
  const importes = words.filter((word) => ["5,421.60", "867.46", "67.77", "6,221.29"].includes(word.text));
  expect(importes).toHaveLength(4);
  expect(new Set(importes.map((word) => word.page))).toEqual(new Set([pdf.pages - 1]));
  for (const importe of importes) {
    expect(importe.xMax).toBeLessThanOrEqual(577);
    expect(importe.yMax).toBeLessThanOrEqual(744);
  }
});

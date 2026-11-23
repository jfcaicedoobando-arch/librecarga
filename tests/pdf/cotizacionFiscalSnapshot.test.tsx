import { expect, it } from "vitest";
import { CotizacionDocument } from "@/pdf/documents/CotizacionDocument";
import { makeCotizacionRow } from "@/test/fixtures/cotizacionFactory";
import { fiscalCotizacionFixture } from "@/test/fixtures/snapshotFiscalCotizacion";
import { inspectPdf } from "./inspectPdf";
import { emisor } from "./fixtures";

it.each(["confirmado", "pendiente"] as const)("PDF real conserva neto agrupado 230.42 y estado %s", async (estado) => {
  const cotizacion = makeCotizacionRow({ organization_id: "org-a", cliente_id: null, estado: "Borrador",
    evaluacion_fiscal: fiscalCotizacionFixture({ estado }),
    conceptos_venta: [1, 2].map((n) => ({ descripcion: `Servicio ${n}`, cantidad: 1, unidad_medida: "Servicio",
      precio_unitario: 100.4, total: 100.4, moneda: "MXN", aplica_iva: true, tasa_iva_aplicada: 0.16, tipo_iva: "tasa_16" })),
  });
  const doc = await inspectPdf(`cotizacion-fiscal-${estado}`, <CotizacionDocument cotizacion={cotizacion} emisor={emisor} />);
  for (const text of ["200.80", "32.13", "2.51", "230.42", "ISR retenido", "IVA retenido", "Base + IVA"]) expect(doc.text).toContain(text);
  expect(doc.text).toContain(estado === "pendiente" ? "Total provisional" : "Total neto");
  if (estado === "pendiente") expect(doc.text).toContain("antes de enviar o aceptar");
});

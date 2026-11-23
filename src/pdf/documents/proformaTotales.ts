import { calcularTotalesProformaConRespaldo, leerFiscalProforma, leerAjusteConsolidacion } from "@/features/proformas/domain";
import type { ConceptoVentaLite } from "@/features/proformas/domain";
import type { TotalesMoneda } from "../components/TotalesBox";
import type { ProformaRow } from "./proformaShared";

/** Mismo BL-12 que detalle/listado: con desglose, importes por moneda sin convertir. */
export function totalesProformaPdf(proforma: ProformaRow, conceptos: ConceptoVentaLite[], tasaIva: number) {
  const fiscal = leerFiscalProforma(proforma);
  if (fiscal) {
    const ajuste = leerAjusteConsolidacion(proforma);
    return {
      bloques: fiscal.bloques.map(({ moneda, subtotal, iva, ret_isr, ret_iva, total }) => ({
        moneda, subtotal, iva, total, retIsr: ret_isr, retIva: ret_iva,
      })),
      nota: ajuste?.pendiente
        ? "El total neto incluye un ajuste de redondeo pendiente de aprobación."
        : "Los importes de los conceptos se muestran antes de retenciones. El total neto usa el desglose fiscal aprobado.",
    };
  }
  const { totales, origen } = calcularTotalesProformaConRespaldo(proforma, conceptos, tasaIva);
  const bloques: TotalesMoneda[] = [
    { moneda: "USD", subtotal: totales.subtotal_usd, iva: totales.iva_usd, total: totales.total_usd },
    { moneda: "MXN", subtotal: totales.subtotal_mxn, iva: totales.iva_mxn, total: totales.total_mxn },
  ];
  return {
    bloques,
    nota: origen === "encabezado_sin_detalle"
      ? "Detalle de conceptos no disponible. Se conserva el importe guardado."
      : undefined,
  };
}

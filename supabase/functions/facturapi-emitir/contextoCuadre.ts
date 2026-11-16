/**
 * P1 · Auditoría fiscal — preflight de cuadre ERP↔CFDI (respuestas 422).
 * `cuadreFiscal.ts` calcula el cuadre por concepto y `cuadreFacturapi.ts`
 * calcula los totales agrupados por impuesto y tasa.
 */
import { jsonResponse } from "../_shared/response.ts";
import {
  diferenciasCuadreFiscal,
  recalcularTotalesConceptos,
  toleranciaCentavos,
  type ConceptoCuadre,
} from "./cuadreFiscal.ts";
import { usaCuadreFacturapi, diferenciasCuadreFacturapi } from "./cuadreFacturapi.ts";
import type { FacturaContext } from "./helpers.ts";
import type { FacturaRow } from "./types.ts";

interface ConceptoImporte {
  descripcion: string;
  cantidad: number | string;
  precio_unitario: number | string;
  tasa_ret_isr?: number | string | null;
}

function usaModoAgrupado(conceptos: ConceptoImporte[], factura: FacturaRow): boolean {
  return (factura.estado === "Borrador" || factura.estado === "Por timbrar")
    && factura.snapshot_emision == null && !factura.uuid_fiscal?.trim()
    && (factura.evaluacion_fiscal != null || usaCuadreFacturapi(conceptos));
}

/**
 * BUG-01 / P1 · Auditoría fiscal: la suma de los conceptos vigentes debe cuadrar
 * con el subtotal guardado. La tolerancia ya NO es de un peso: se usa el mismo
 * redondeo monetario por concepto que el payload y sólo se perdonan centavos
 * (un centavo por renglón, por la acumulación del redondeo).
 */
export function validarCuadreSubtotal(conceptos: ConceptoImporte[], factura: FacturaRow): Response | null {
  // Full classified fiscal validation below enforces exact totals for this mode.
  // Do not reject its aggregate subtotal with the legacy per-line calculation first.
  if (usaModoAgrupado(conceptos, factura)) return null;
  const subtotalHeader = factura.subtotal != null ? Number(factura.subtotal) : null;
  if (subtotalHeader == null || !Number.isFinite(subtotalHeader)) return null;
  const suma = recalcularTotalesConceptos(
    conceptos.map((c) => ({
      descripcion: c.descripcion,
      cantidad: Number(c.cantidad),
      precio_unitario: Number(c.precio_unitario),
    })),
  ).subtotal;
  const tolerancia = toleranciaCentavos(conceptos.length);
  if (Math.abs(suma - subtotalHeader) <= tolerancia) return null;
  return jsonResponse({
    error: "subtotal_descuadrado",
    message:
      `Los conceptos vigentes suman ${suma.toFixed(2)} pero la factura tiene un subtotal de ${subtotalHeader.toFixed(2)} ` +
      `(tolerancia ${tolerancia.toFixed(2)}). Revisa los conceptos antes de timbrar.`,
  }, 422);
}

/**
 * P1 · Auditoría fiscal — cuadre COMPLETO (IVA trasladado, retenciones y total)
 * de los renglones ya clasificados contra la cabecera. Evita que un descuadre
 * ERP↔CFDI se propague al saldo y a las parcialidades del complemento de pago.
 * Nunca se cambia un tratamiento fiscal para hacer cuadrar los números.
 */
export function validarCuadreFiscal(
  conceptos: FacturaContext["conceptos"],
  factura: FacturaRow,
): Response | null {
  const filas: ConceptoCuadre[] = conceptos.map((c) => ({
    descripcion: c.descripcion,
    cantidad: c.cantidad,
    precio_unitario: c.precio_unitario,
    tipo_iva: c.tipo_iva ?? null,
    tasa_iva: c.tasa_iva ?? null,
    tasa_ret_isr: c.tasa_ret_isr ?? null,
    tasa_ret_iva: c.tasa_ret_iva ?? null,
  }));
  const comparar = usaModoAgrupado(filas, factura) ? diferenciasCuadreFacturapi : diferenciasCuadreFiscal;
  const detalles = comparar(filas, {
    subtotal: factura.subtotal,
    iva: factura.iva,
    total: factura.total,
    ret_isr: factura.ret_isr,
    ret_iva: factura.ret_iva,
  });
  if (detalles.length === 0) return null;
  return jsonResponse({
    error: "totales_descuadrados",
    message:
      `Los importes de la factura no coinciden con sus conceptos (${detalles.join("; ")}). ` +
      "Vuelve a guardar la factura para recalcular sus totales antes de timbrar.",
    issues: detalles,
  }, 422);
}

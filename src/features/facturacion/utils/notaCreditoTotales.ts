/**
 * Totales de una nota de crédito. Se calcula por línea con el motor canónico
 * antes de sumar (B-007 / M3): el flotante crudo dejaba centavos fantasma en
 * el saldo o rechazaba NCs legítimas por epsilon.
 *
 * P1-IVA — el IVA sale del tratamiento fiscal del renglón (16%, 8%, tasa 0,
 * exento o no objeto) con la misma regla del payload SAT, y las retenciones
 * ISR/IVA del renglón original se reversan restando del total.
 */
import { sumarMontos } from "@/lib/financial/financialUtils";
import { Decimal } from "decimal.js";
import { impuestosLineaNC, tasaTrasladoNC } from "@/features/facturacion/utils/impuestosNotaCredito";
import type { ConceptoNotaCredito } from "@/features/facturacion/services/notasCredito";

export interface TotalesNC {
  subtotal: number;
  iva: number;
  /** Retención de ISR reversada (resta del total). */
  retIsr: number;
  /** Retención de IVA reversada (resta del total). */
  retIva: number;
  total: number;
}

const FiscalDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

function sumarImpuesto(grupos: Map<number, Decimal>, tasa: number, base: Decimal) {
  grupos.set(tasa, (grupos.get(tasa) ?? new FiscalDecimal(0)).plus(base.times(tasa)));
}

function totalImpuesto(grupos: Map<number, Decimal>) {
  return sumarMontos([...grupos.values()].map((monto) => monto.toDecimalPlaces(2).toNumber()));
}

function calcularTotalesAgrupados(conceptos: ConceptoNotaCredito[]): TotalesNC {
  let base = new FiscalDecimal(0);
  const traslados = new Map<number, Decimal>();
  const isr = new Map<number, Decimal>();
  const ivaRetenido = new Map<number, Decimal>();
  for (const concepto of conceptos) {
    const importe = new FiscalDecimal(concepto.cantidad).times(concepto.precio_unitario);
    base = base.plus(importe);
    sumarImpuesto(traslados, tasaTrasladoNC(concepto), importe);
    sumarImpuesto(isr, concepto.tasa_ret_isr ?? 0, importe);
    sumarImpuesto(ivaRetenido, concepto.tasa_ret_iva ?? 0, importe);
  }
  const subtotal = base.toDecimalPlaces(2).toNumber();
  const iva = totalImpuesto(traslados);
  const retIsr = totalImpuesto(isr);
  const retIva = totalImpuesto(ivaRetenido);
  return { subtotal, iva, retIsr, retIva, total: sumarMontos([subtotal, iva, -retIsr, -retIva]) };
}

export function calcularTotalesNC(conceptos: ConceptoNotaCredito[], agrupar = false): TotalesNC {
  if (agrupar) return calcularTotalesAgrupados(conceptos);
  const lineas = conceptos.map((c) => impuestosLineaNC(c));
  return {
    subtotal: sumarMontos(lineas.map((l) => l.base)),
    iva: sumarMontos(lineas.map((l) => l.iva)),
    retIsr: sumarMontos(lineas.map((l) => l.retIsr)),
    retIva: sumarMontos(lineas.map((l) => l.retIva)),
    total: sumarMontos(lineas.map((l) => l.total)),
  };
}

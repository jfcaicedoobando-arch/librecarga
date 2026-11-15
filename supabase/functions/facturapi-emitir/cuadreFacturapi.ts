import { Decimal } from "npm:decimal.js@10.6.0";
import type { ConceptoCuadre, TotalesCuadre, CabeceraCuadre } from "./cuadreFiscal.ts";

const FiscalDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Technical rounding mode, not a decision about whether the issuer qualifies. */
export function usaCuadreFacturapi(conceptos: ReadonlyArray<{ tasa_ret_isr?: number | string | null }>): boolean {
  return conceptos.some((c) => c.tasa_ret_isr != null && new FiscalDecimal(c.tasa_ret_isr).equals("0.0125"));
}

function decimalFiscal(value: number | string): Decimal {
  const decimal = new FiscalDecimal(value);
  if (!decimal.isFinite() || decimal.isNegative()) throw new Error("importe_fiscal_invalido");
  return decimal;
}

function sumarGrupo(grupos: Map<string, Decimal>, clave: string, importe: Decimal, tasa: Decimal): void {
  grupos.set(clave, (grupos.get(clave) ?? new FiscalDecimal(0)).plus(importe.times(tasa)));
}

function redondearGrupos(grupos: Map<string, Decimal>): Decimal {
  return [...grupos.values()].reduce((sum, value) => sum.plus(value.toDecimalPlaces(2)), new FiscalDecimal(0));
}

/** Exact bases; each transfer/withholding group is rounded by tax and rate.
 * This calculation does not alter quantities, unit prices or stored documents.
 */
export function recalcularTotalesFacturapi(conceptos: ConceptoCuadre[]): TotalesCuadre {
  let base = new FiscalDecimal(0);
  const retIva = new Map<string, Decimal>();
  const retIsr = new Map<string, Decimal>();
  const traslados = new Map<string, Decimal>();
  for (const concepto of conceptos) {
    const importe = decimalFiscal(concepto.cantidad).times(decimalFiscal(concepto.precio_unitario));
    base = base.plus(importe);
    if (concepto.tipo_iva === "gravado_16" || concepto.tipo_iva === "gravado_8") {
      const tasa = decimalFiscal(concepto.tasa_iva ?? 0);
      const grupo = `${concepto.tipo_iva}:${tasa.toString()}`;
      sumarGrupo(traslados, grupo, importe, tasa);
    }
    const tasaIva = decimalFiscal(concepto.tasa_ret_iva ?? 0);
    const tasaIsr = decimalFiscal(concepto.tasa_ret_isr ?? 0);
    sumarGrupo(retIva, tasaIva.toString(), importe, tasaIva);
    sumarGrupo(retIsr, tasaIsr.toString(), importe, tasaIsr);
  }
  const subtotal = base.toDecimalPlaces(2);
  const iva = redondearGrupos(traslados);
  const retencionesIva = redondearGrupos(retIva);
  const retencionesIsr = redondearGrupos(retIsr);
  return {
    subtotal: subtotal.toNumber(), iva_trasladado: iva.toNumber(),
    ret_iva: retencionesIva.toNumber(), ret_isr: retencionesIsr.toNumber(),
    total: subtotal.plus(iva).minus(retencionesIva).minus(retencionesIsr).toNumber(),
  };
}

/** Exact cent comparison: a growing per-line tolerance cannot hide a tax discrepancy. */
export function diferenciasCuadreFacturapi(conceptos: ConceptoCuadre[], cabecera: CabeceraCuadre): string[] {
  const totales = recalcularTotalesFacturapi(conceptos);
  const campos = [
    ["Subtotal", totales.subtotal, cabecera.subtotal],
    ["IVA trasladado", totales.iva_trasladado, cabecera.iva],
    ["Retención ISR", totales.ret_isr, cabecera.ret_isr],
    ["Retención IVA", totales.ret_iva, cabecera.ret_iva],
    ["Total", totales.total, cabecera.total],
  ] as const;
  return campos.flatMap(([nombre, calculado, guardado]) => {
    if (guardado == null) return [`${nombre}: falta el importe guardado`];
    const actual = decimalFiscal(guardado);
    if (actual.equals(calculado)) return [];
    return [`${nombre}: los conceptos dan ${new FiscalDecimal(calculado).toFixed(2)} y la factura tiene ${actual.toFixed(2)}`];
  });
}

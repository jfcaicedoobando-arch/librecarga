import { Decimal } from "npm:decimal.js@10.6.0";
import { atributo, importe, nodos, seccion } from "./xmlConciliacionCfdi.ts";

export interface ImpuestoRepIsr {
  type: "ISR" | "IVA";
  rate: number;
  factor: "Tasa" | "Exento";
  withholding: boolean;
  base: number;
}

const CODIGO = { ISR: "001", IVA: "002" } as const;
const TASAS_MXN = { "0.16": "IVA16", "0.08": "IVA8", "0": "IVA0" } as const;

type ImpuestoXml = { codigo: string; factor: string; tasa: Decimal; base: Decimal; importe: Decimal | null };

function clave(codigo: string | null, factor: string | null, tasa: Decimal) {
  return `${codigo}/${factor}/${tasa.toString()}`;
}

function decimalDe(nodo: string, campo: string) {
  const valor = atributo(nodo, campo);
  const monto = importe(valor);
  const decimales = valor?.split(".")[1]?.length ?? 0;
  if (decimales > 6) throw new Error("precision_impuesto_rep_invalida");
  return { monto, decimales };
}

function verificarImporteDR(nodo: string, tasa: Decimal, base: ReturnType<typeof decimalDe>): Decimal {
  const { monto, decimales } = decimalDe(nodo, "ImporteDR");
  // Pagos 2.0 calcula el intervalo con la precisión declarada en el XML.
  const margen = new Decimal(10).pow(-base.decimales).div(2);
  const inferior = base.monto.minus(margen).times(tasa).toDecimalPlaces(decimales, Decimal.ROUND_DOWN);
  const superior = base.monto.plus(margen).minus("0.000000000001").times(tasa)
    .toDecimalPlaces(decimales, Decimal.ROUND_UP);
  if (monto.lt(inferior) || monto.gt(superior)) throw new Error("importe_impuesto_rep_no_coincide");
  return monto;
}

function gruposDr(nodosXml: string[], esperados: ImpuestoRepIsr[]) {
  const pendientes = new Map(esperados.map((t) => [clave(CODIGO[t.type], t.factor, importe(t.rate)), t]));
  if (pendientes.size !== esperados.length || nodosXml.length !== pendientes.size) {
    throw new Error("grupos_impuestos_rep_no_coinciden");
  }
  const grupos: ImpuestoXml[] = [];
  for (const nodo of nodosXml) {
    const codigo = atributo(nodo, "ImpuestoDR");
    const factor = atributo(nodo, "TipoFactorDR");
    const tasa = factor === "Exento" ? new Decimal(0) : decimalDe(nodo, "TasaOCuotaDR").monto;
    const llave = clave(codigo, factor, tasa);
    const esperado = pendientes.get(llave);
    const base = decimalDe(nodo, "BaseDR");
    if (!esperado || !codigo || !factor || !base.monto.gt(0) || !base.monto.eq(esperado.base)) {
      throw new Error("base_o_tasa_impuesto_rep_no_coincide");
    }
    if (factor === "Exento" && (esperado.withholding || atributo(nodo, "TasaOCuotaDR") != null || atributo(nodo, "ImporteDR") != null)) {
      throw new Error("tratamiento_exento_rep_invalido");
    }
    pendientes.delete(llave);
    grupos.push({ codigo, factor, tasa, base: base.monto, importe: factor === "Exento" ? null : verificarImporteDR(nodo, tasa, base) });
  }
  return grupos;
}

function verificarConvertido(nodo: string, campo: string, esperado: Decimal) {
  const { monto, decimales } = decimalDe(nodo, campo);
  if (!monto.eq(esperado.toDecimalPlaces(Math.max(2, decimales), Decimal.ROUND_HALF_UP))) {
    throw new Error("impuestos_moneda_pago_no_coinciden");
  }
  return monto;
}

function retencionesP(xml: string, retenciones: ImpuestoXml[], equivalencia: Decimal, tc: Decimal) {
  const sumaDr = new Map<string, Decimal>();
  for (const ret of retenciones) {
    sumaDr.set(ret.codigo, (sumaDr.get(ret.codigo) ?? new Decimal(0)).plus(ret.importe ?? 0));
  }
  const nodosXml = nodos(xml, "RetencionP");
  if (nodosXml.length !== sumaDr.size) throw new Error("retenciones_moneda_pago_no_coinciden");
  const impuestosPendientes = new Map(sumaDr);
  const totalesMxn: Record<string, Decimal> = {};
  for (const nodo of nodosXml) {
    const codigo = atributo(nodo, "ImpuestoP");
    const totalDr = impuestosPendientes.get(codigo ?? "");
    if (!codigo || !totalDr) throw new Error("retenciones_moneda_pago_no_coinciden");
    impuestosPendientes.delete(codigo);
    const monto = verificarConvertido(nodo, "ImporteP", totalDr.div(equivalencia));
    totalesMxn[codigo === CODIGO.ISR ? "TotalRetencionesISR" : "TotalRetencionesIVA"] = monto.times(tc);
  }
  return { sumaDr, totalesMxn };
}

function trasladosP(xml: string, traslados: ImpuestoXml[], equivalencia: Decimal, tc: Decimal) {
  const nodosXml = nodos(xml, "TrasladoP");
  if (nodosXml.length !== traslados.length) throw new Error("traslados_moneda_pago_no_coinciden");
  const pendientes = new Map(traslados.map((t) => [clave(t.codigo, t.factor, t.tasa), t]));
  const totalesMxn: Record<string, Decimal> = {};
  for (const nodo of nodosXml) {
    const codigo = atributo(nodo, "ImpuestoP");
    const factor = atributo(nodo, "TipoFactorP");
    const tasa = factor === "Exento" ? new Decimal(0) : decimalDe(nodo, "TasaOCuotaP").monto;
    const llave = clave(codigo, factor, tasa);
    const traslado = pendientes.get(llave);
    const sufijo = factor === "Exento" ? "IVAExento" : TASAS_MXN[tasa.toString() as keyof typeof TASAS_MXN];
    if (!traslado || codigo !== CODIGO.IVA || !sufijo) throw new Error("traslados_moneda_pago_no_coinciden");
    pendientes.delete(llave);
    totalesMxn[`TotalTrasladosBase${sufijo}`] = verificarConvertido(nodo, "BaseP", traslado.base.div(equivalencia)).times(tc);
    if (traslado.importe != null) {
      totalesMxn[`TotalTrasladosImpuesto${sufijo}`] = verificarConvertido(nodo, "ImporteP", traslado.importe.div(equivalencia)).times(tc);
    } else if (atributo(nodo, "ImporteP") != null || atributo(nodo, "TasaOCuotaP") != null) {
      throw new Error("tratamiento_exento_rep_invalido");
    }
  }
  return totalesMxn;
}

export function verificarImpuestosRepIsr(input: {
  documento: string; pago: string; totales: string; grupos: ImpuestoRepIsr[];
  equivalencia: Decimal; tipoCambioP: Decimal; efectivo: Decimal;
}) {
  const { documento, pago, totales, grupos, equivalencia, tipoCambioP, efectivo } = input;
  const impuestosDr = grupos.length ? seccion(documento, "ImpuestosDR").contenido : "";
  const impuestosP = grupos.length ? seccion(pago, "ImpuestosP").contenido : "";
  if (!grupos.length && (nodos(documento, "ImpuestosDR").length || nodos(pago, "ImpuestosP").length)) {
    throw new Error("grupos_impuestos_rep_no_coinciden");
  }
  const retenciones = gruposDr(nodos(impuestosDr, "RetencionDR"), grupos.filter((grupo) => grupo.withholding));
  const traslados = gruposDr(nodos(impuestosDr, "TrasladoDR"), grupos.filter((grupo) => !grupo.withholding));
  const ret = retencionesP(impuestosP, retenciones, equivalencia, tipoCambioP);
  const esperados = {
    MontoTotalPagos: efectivo.times(tipoCambioP), ...ret.totalesMxn,
    ...trasladosP(impuestosP, traslados, equivalencia, tipoCambioP),
  };
  for (const [campo, monto] of Object.entries(esperados)) {
    if (!importe(atributo(totales, campo)).eq(monto.toDecimalPlaces(2, Decimal.ROUND_HALF_UP))) {
      throw new Error("totales_mxn_rep_no_coinciden");
    }
  }
  const camposXml = [...totales.matchAll(/\s(TotalRetenciones\w+|TotalTraslados\w+)\s*=/g)];
  if (camposXml.some(([, campo]) => !Object.hasOwn(esperados, campo))) throw new Error("totales_mxn_rep_no_coinciden");
  return {
    ret_isr: ret.sumaDr.get(CODIGO.ISR)?.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber() ?? 0,
    ret_iva: ret.sumaDr.get(CODIGO.IVA)?.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber() ?? 0,
  };
}

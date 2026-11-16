import { Decimal } from "npm:decimal.js@10.6.0";
import { exigirInvoices } from "../_shared/facturapiSdk.ts";
import type { ImpuestoRepIsr } from "../_shared/impuestosRepIsr.ts";
import type { FacturapiRepPayload, PagoContext } from "./helpers.ts";
import { conTimeout, COD_REP_RESUMEN_DIVERGENTE, COD_REP_RESUMEN_NO_DISPONIBLE,
  MSG_REP_RESUMEN_NO_DISPONIBLE } from "./resumenProveedor.ts";
import { MSG_REP_PARIDAD_RESUMEN } from "./paridadResumen.ts";
import type { JsonFn } from "./etapaResultado.ts";

type DocumentoRep = FacturapiRepPayload["complements"][number]["data"][number]["related_documents"][number];

interface ResumenIsrRemoto {
  uuid?: string;
  currency?: string;
  installment?: number;
  last_balance?: number;
  amount?: number;
  total?: number;
  taxability?: string;
  taxes?: unknown;
}

function clave(tipo: string, factor: string, tasa: number, retiene: boolean) {
  return `${tipo}/${factor}/${tasa}/${retiene}`;
}

function basesAutorizadas(grupos: ImpuestoRepIsr[], dr: PagoContext["documento_relacionado"]) {
  return new Map(grupos.map((g) => {
    const base = g.withholding
      ? dr.retenciones?.find((r) => r.tipo === g.type && r.tasa === g.rate)?.importe
      : dr.grupos_iva?.find((r) => r.factor === g.factor && r.tasa === g.rate)?.importe;
    return [clave(g.type, g.factor, g.rate, g.withholding), base ?? dr.subtotal_factura ?? 0];
  }));
}

function resumenCoincide(
  resumen: ResumenIsrRemoto, documento: DocumentoRep, dr: PagoContext["documento_relacionado"],
): resumen is ResumenIsrRemoto & { taxes: Array<Partial<ImpuestoRepIsr> | null> } {
  return !!resumen && typeof resumen.uuid === "string" && resumen.uuid.toUpperCase() === documento.uuid.toUpperCase()
    && resumen.currency === documento.currency && resumen.amount === documento.amount
    && resumen.installment === documento.installment && resumen.last_balance === documento.last_balance
    && (resumen.total == null || resumen.total === dr.total_factura)
    && (resumen.taxability == null || resumen.taxability === documento.taxability)
    && Array.isArray(resumen.taxes) && resumen.taxes.length === documento.taxes.length;
}

function normalizarGrupo(grupo: Partial<ImpuestoRepIsr> | null): ImpuestoRepIsr | null {
  if (!grupo || (grupo.type !== "IVA" && grupo.type !== "ISR") || typeof grupo.base !== "number"
    || !Number.isFinite(grupo.base) || grupo.base <= 0) return null;
  const factor = grupo.factor ?? "Tasa";
  const rate = grupo.rate ?? (factor === "Exento" ? 0 : null);
  if ((factor !== "Tasa" && factor !== "Exento") || typeof rate !== "number" || !Number.isFinite(rate)
    || (grupo.withholding != null && typeof grupo.withholding !== "boolean")) return null;
  return { type: grupo.type, rate, factor, base: grupo.base, withholding: grupo.withholding === true };
}

function impuestosResumenIsr(
  resumen: ResumenIsrRemoto, documento: DocumentoRep, dr: PagoContext["documento_relacionado"],
): ImpuestoRepIsr[] | null {
  if (!resumenCoincide(resumen, documento, dr)) return null;
  const pendientes = basesAutorizadas(documento.taxes, dr);
  const grupos: ImpuestoRepIsr[] = [];
  let netoGravado = new Decimal(0);
  for (const crudo of resumen.taxes) {
    const grupo = normalizarGrupo(crudo);
    if (!grupo) return null;
    const llave = clave(grupo.type, grupo.factor, grupo.rate, grupo.withholding);
    const maximo = pendientes.get(llave);
    const base = new Decimal(grupo.base);
    if (maximo == null || base.decimalPlaces() > 6 || base.gt(new Decimal(maximo).toDecimalPlaces(base.decimalPlaces()))) return null;
    pendientes.delete(llave);
    const impuesto = base.times(grupo.rate);
    netoGravado = grupo.withholding ? netoGravado.minus(impuesto) : netoGravado.plus(base).plus(impuesto);
    grupos.push(grupo);
  }
  // Las bases del PAC pueden redondearse al centavo por grupo. El pago aprobado sigue intacto.
  const diferencia = new Decimal(documento.amount).minus(netoGravado);
  const tolerancia = new Decimal("0.01").times(Math.max(1, grupos.length));
  if (pendientes.size || diferencia.lt(tolerancia.negated())
    || diferencia.gt(tolerancia.plus(dr.importe_no_objeto ?? 0))) return null;
  return grupos;
}

export async function consultarImpuestosResumenIsr(args: {
  facturapi: object; facturaId: string | null; ctx: PagoContext; documento: DocumentoRep; json: JsonFn;
}) {
  const { facturapi, facturaId, ctx, documento, json } = args;
  if (facturaId && /^[A-Za-z0-9_-]{1,150}$/.test(facturaId)) {
    let resumen: ResumenIsrRemoto;
    try {
      const invoices = exigirInvoices(facturapi) as unknown as {
        paymentSummary: (id: string, opts: { amount: number }) => Promise<ResumenIsrRemoto>;
      };
      resumen = await conTimeout(invoices.paymentSummary(facturaId, { amount: documento.amount }));
    } catch {
      return { response: json({ error: COD_REP_RESUMEN_NO_DISPONIBLE, message: MSG_REP_RESUMEN_NO_DISPONIBLE, retryable: true }, 503) };
    }
    const impuestos = impuestosResumenIsr(resumen, documento, ctx.documento_relacionado);
    if (impuestos) return { impuestos };
  }
  return { response: json({ error: COD_REP_RESUMEN_DIVERGENTE, message: MSG_REP_PARIDAD_RESUMEN }, 422) };
}

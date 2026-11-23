import { recalcularTotalesFacturapi } from "../_shared/cuadreFacturapi.ts";
import { buildTaxesNc, type NotaCreditoContext } from "./helpers.ts";

export function calcularTotalesNotaFiscal(ctx: Pick<NotaCreditoContext, "conceptos">) {
  return recalcularTotalesFacturapi(ctx.conceptos.map((concepto) => ({
    ...concepto,
    tasa_iva: buildTaxesNc(concepto).find((tax) => tax.type === "IVA" && !tax.withholding)?.rate ?? 0,
  })));
}

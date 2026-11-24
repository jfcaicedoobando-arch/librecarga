/** Textos de solo lectura para las versiones anteriores y la regla de quién puede recotizar. */
import { formatCurrencySafe } from "@/lib/formatters/numbers";
import type { SolicitudPricingRow } from "./tiposPricing";

type Registro = Record<string, unknown>;
const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
export const MINIMO_MOTIVO_RECOTIZAR = 5;

export const listaRegistros = (v: unknown): Registro[] => (Array.isArray(v) ? (v as Registro[]) : []);

export function puedeRecotizar(s: Pick<SolicitudPricingRow, "estado">, esPricing: boolean): boolean {
  return esPricing && (s.estado === "respondida" || s.estado === "cotizada");
}

export function resumenOpcion(o: Registro): string {
  const flete = o.of_tarifa != null ? formatCurrencySafe(o.of_tarifa, txt(o.of_moneda) ?? "USD") : null;
  return [txt(o.agente), txt(o.ruta), flete ? `Flete ${flete}` : null, txt(o.transito)].filter(Boolean).join(" · ") || "Opción sin detalle";
}

export function resumenTarifa(t: Registro): string {
  const vig = [txt(t.vigente_desde), txt(t.vigente_hasta)].filter(Boolean).join(" a ");
  return [txt(t.modo) ?? "Tarifa", txt(t.moneda), vig ? `vigencia ${vig}` : null].filter(Boolean).join(" · ");
}

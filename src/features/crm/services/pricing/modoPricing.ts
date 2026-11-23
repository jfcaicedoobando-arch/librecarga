/** Submodalidad e Incoterms por modo; espejo de `crm_enviar_solicitud_pricing` y su CHECK. */
import { INCOTERMS_PRICING } from "./tiposPricing";

export const SUBMODALIDADES_PRICING: Record<string, readonly string[]> = {
  "Marítimo": ["FCL", "LCL"],
  Terrestre: ["FTL", "LTL", "Arrastre"],
};
const SOLO_MARITIMO = new Set(["FAS", "FOB", "CFR", "CIF"]);

export const submodalidadesDe = (modo?: string | null) => SUBMODALIDADES_PRICING[modo ?? ""] ?? [];
export const requiereSubmodalidad = (modo?: string | null) => submodalidadesDe(modo).length > 0;
export const incotermsDe = (modo?: string | null): string[] =>
  !modo || modo === "Marítimo" ? [...INCOTERMS_PRICING] : INCOTERMS_PRICING.filter((i) => !SOLO_MARITIMO.has(i));
export const pideContenedor = (sub?: string | null) => sub === "FCL" || sub === "Arrastre";

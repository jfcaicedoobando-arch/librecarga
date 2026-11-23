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

/** Plazo en horas hábiles por modo (espejo de `_crm_pricing_horas_modo`); baja = sin contador. */
const PLAZOS: Record<string, { media: number; alta: number }> = {
  "Marítimo": { media: 36, alta: 48 }, "Aéreo": { media: 12, alta: 24 }, Terrestre: { media: 24, alta: 48 },
};
export function horasPlazo(complejidad: string, modo?: string | null): number | null {
  if (complejidad === "baja") return null;
  const p = PLAZOS[modo ?? ""] ?? PLAZOS["Marítimo"];
  return complejidad === "alta" ? p.alta : p.media;
}
export const DESCRIPCION_PLAZOS_MODO = "Estándar sin contador · " + Object.entries(PLAZOS)
  .map(([m, p]) => `${m}: media ${p.media} h, alta ${p.alta} h`).join(" · ") + " (horas hábiles)";

export const MODALIDADES_NEGOCIO = ["Spot", "Contrato", "Licitación"] as const;
export const CLASES_IMO = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((c) => ({ value: c, label: `Clase ${c}` }));

/** Número UN: sólo 4 dígitos (acepta "UN 1203"); otro valor → null. */
export function normalizarNumeroUN(v: string): string | null {
  const d = v.replace(/^\s*UN\s*/i, "").trim();
  return /^[0-9]{4}$/.test(d) ? d : null;
}

/** Peso/medida (W/M) en LCL: el mayor entre toneladas y CBM; null si falta dato o la unidad no es de peso. */
export function pesoMedidaWM(peso: string | null | undefined, unidad: string | null | undefined, cbm: number | null | undefined): number | null {
  const n = Number(String(peso ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0 || cbm == null) return null;
  const ton = unidad === "kg" ? n / 1000 : unidad === "t" ? n : unidad === "lb" ? (n * 0.45359237) / 1000 : null;
  return ton == null ? null : Math.max(ton, cbm);
}

/** Datos condicionales de carga que la base exige al enviar (LCL e IMO). */
export function faltantesCargaDetalle(d: {
  submodalidad?: string | null; volumen_cbm?: number | null; imo?: boolean | null; imo_clase?: string | null; imo_un?: string | null;
}): string[] {
  const f: string[] = [];
  if (d.submodalidad === "LCL" && d.volumen_cbm == null) f.push("Volumen (CBM)");
  if (d.imo === true && !d.imo_clase) f.push("Clase IMO");
  if (d.imo === true && !d.imo_un) f.push("Número UN");
  return f;
}

/** Reglas de pantalla de la solicitud terrestre (espejo de `crm_enviar_solicitud_pricing`). */

export const COLUMNAS_TERRESTRE = [
  "origen_cp", "destino_cp", "paradas", "cruce_fronterizo", "in_bond", "tipo_unidad",
  "tarimas", "arrastre_puerto", "retorno_vacio", "sobrepeso",
] as const;

/** Valores en blanco para limpiar al salir de Terrestre (la base los rechaza en otros modos). */
export const TERRESTRE_VACIO = Object.fromEntries(COLUMNAS_TERRESTRE.map((c) => [c, null])) as Record<(typeof COLUMNAS_TERRESTRE)[number], null>;

export function faltantesTerrestre(d: { servicio?: string | null; submodalidad?: string | null; tipo_unidad?: string | null; tarimas?: number | null }): string[] {
  if (d.servicio !== "Terrestre") return [];
  const f: string[] = [];
  if (d.submodalidad === "FTL" && !d.tipo_unidad?.trim()) f.push("Tipo de unidad");
  if (d.submodalidad === "LTL" && d.tarimas == null) f.push("Tarimas");
  return f;
}

/** «Monterrey, 64000» → ["Monterrey", "64000"]; máximo 5 paradas. null si no hay ninguna. */
export function paradasDeTexto(t: string): string[] | null {
  const l = t.split(/[;,\n]+/).map((x) => x.trim()).filter(Boolean).slice(0, 5);
  return l.length ? l : null;
}

/** CP mexicano/EUA de 5 dígitos o null. */
export function cpValido(t: string): string | null {
  const v = t.trim();
  return /^\d{5}$/.test(v) ? v : null;
}

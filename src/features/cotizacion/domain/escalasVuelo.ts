/**
 * Escalas del vuelo según la tarifa aérea ligada a la cotización.
 * `costeo_tarifas.escalas` NULL o vacío = vuelo directo; `undefined` = sin tarifa (no se muestra).
 */
export function textoEscalas(escalas: string[] | null | undefined): string | null {
  if (escalas === undefined) return null;
  const lista = (escalas ?? []).map((e) => e.trim().toUpperCase()).filter(Boolean);
  return lista.length ? lista.join(" → ") : "Vuelo directo";
}

/** Par etiqueta/valor para resumen y PDF; vacío si no hay dato. */
export function itemEscalas(escalas: string[] | null | undefined): Array<[string, string]> {
  const texto = textoEscalas(escalas);
  return texto ? [["Escalas", texto]] : [];
}

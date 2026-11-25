/** Línea informativa en las notas existentes de la tarifa, sin cambiar su contrato SQL. */
export type TipoAvion = "PAX" | "CAO";

export function notasTipoAvion(tipo: TipoAvion | null | undefined): string | null {
  return tipo ? `Tipo de avión: ${tipo}` : null;
}

export function tipoAvionTarifa(notas: string | null | undefined): TipoAvion | null {
  const valor = notas?.split(/\r?\n/).find((linea) => /^Tipo de avión: (PAX|CAO)$/.test(linea));
  if (valor === "Tipo de avión: PAX") return "PAX";
  if (valor === "Tipo de avión: CAO") return "CAO";
  return null;
}

export function tipoAvionCotizacion(notas: string | null | undefined, historico: string | null): string | null {
  return tipoAvionTarifa(notas) ?? historico;
}
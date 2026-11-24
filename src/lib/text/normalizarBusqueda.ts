/** Normaliza una búsqueda de texto sin depender de mayúsculas, acentos ni espacios externos. */
export function normalizarBusqueda(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

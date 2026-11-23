export function normalizarBusqueda(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

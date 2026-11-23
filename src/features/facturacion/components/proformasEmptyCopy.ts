/**
 * Copy del estado vacío del listado de proformas (sin JSX, para no romper el
 * fast-refresh del archivo de componentes).
 */
export function proformasTieneFiltros(filtros: {
  fechaDesde?: string | null; fechaHasta?: string | null; filtroCliente: string; filtroOperador: string;
}, rangoExterno: boolean) {
  return [rangoExterno, filtros.fechaDesde, filtros.fechaHasta,
    filtros.filtroCliente !== "todos", filtros.filtroOperador !== "todos"].some(Boolean);
}

export function mensajeVacioProformas(search: string, filtroEstado: string): string {
  const q = search.trim();
  if (q) return `Sin resultados para «${q}»`;
  if (filtroEstado === "aceptada") return "Ninguna proforma aceptada pendiente de emitir";
  return "No hay proformas generadas";
}

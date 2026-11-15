import type { ChipItem } from "@/hooks/shared/useTableFilters";
import type { FacturasEmitidasFiltros } from "./facturasEmitidasProps";

export function buildFacturasEmitidasChips(f: FacturasEmitidasFiltros): ChipItem[] {
  const chips: ChipItem[] = [];
  if (f.filterEstado && f.filterEstado !== "todos") {
    chips.push({ key: "estado", label: `Estado: ${f.filterEstado}`, onRemove: () => f.setFilter("estado", "todos") });
  }
  if (f.filterCliente && f.filterCliente !== "todos") {
    const cliente = f.clientes.find((x) => x.id === f.filterCliente);
    chips.push({ key: "cliente", label: `Cliente: ${cliente?.nombre ?? f.filterCliente}`, onRemove: () => f.setFilter("cliente", "todos") });
  }
  if (f.fechaDesde) chips.push({ key: "desde", label: `Desde: ${f.fechaDesde}`, onRemove: () => f.setFechaDesde("") });
  if (f.fechaHasta) chips.push({ key: "hasta", label: `Hasta: ${f.fechaHasta}`, onRemove: () => f.setFechaHasta("") });
  return chips;
}

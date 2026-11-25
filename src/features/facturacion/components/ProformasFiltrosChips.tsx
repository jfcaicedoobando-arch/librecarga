/**
 * Chips de filtros activos para el listado de Proformas.
 * Mismo patrón que `EmbarquesFiltrosChips`.
 */
import { ActiveFilterChips } from "@/components/shared/ActiveFilterChips";
import { formatDate } from "@/lib/formatters";
import { LABEL_ESTADO_UNIFICADO, type EstadoUnificadoProforma } from "@/lib/domain/estadoUnificado";

interface ClienteOption { id: string; nombre: string }

export interface ProformasFiltrosChipsProps {
  filtroEstado: string;
  onFiltroEstadoChange: (v: string) => void;
  filtroCliente: string;
  onFiltroClienteChange: (v: string) => void;
  filtroOperador: string;
  onFiltroOperadorChange: (v: string) => void;
  fechaDesde: string;
  onFechaDesdeChange: (v: string) => void;
  fechaHasta: string;
  onFechaHastaChange: (v: string) => void;
  clientes: ClienteOption[];
  onClearAll: () => void;
}

interface ChipDef { key: string; label: string; value: string; onRemove: () => void }

function estadoLabel(v: string): string {
  if (v === "todas") return v;
  return LABEL_ESTADO_UNIFICADO[v as EstadoUnificadoProforma] ?? v;
}

export function ProformasFiltrosChips(props: ProformasFiltrosChipsProps) {
  const chips: ChipDef[] = [];

  if (props.filtroEstado && props.filtroEstado !== "todas") {
    chips.push({
      key: "estado",
      label: "Estado",
      value: estadoLabel(props.filtroEstado),
      onRemove: () => props.onFiltroEstadoChange("todas"),
    });
  }
  if (props.filtroCliente && props.filtroCliente !== "todos") {
    const cliente = props.clientes.find((c) => c.id === props.filtroCliente);
    chips.push({
      key: "cliente",
      label: "Cliente",
      value: cliente?.nombre ?? "—",
      onRemove: () => props.onFiltroClienteChange("todos"),
    });
  }
  if (props.filtroOperador && props.filtroOperador !== "todos") {
    chips.push({
      key: "operador",
      label: "Operador",
      value: props.filtroOperador,
      onRemove: () => props.onFiltroOperadorChange("todos"),
    });
  }
  if (props.fechaDesde) {
    chips.push({
      key: "fechaDesde",
      label: "Desde",
      value: formatDate(props.fechaDesde),
      onRemove: () => props.onFechaDesdeChange(""),
    });
  }
  if (props.fechaHasta) {
    chips.push({
      key: "fechaHasta",
      label: "Hasta",
      value: formatDate(props.fechaHasta),
      onRemove: () => props.onFechaHastaChange(""),
    });
  }

  return <ActiveFilterChips chips={chips} onClearAll={props.onClearAll} searchId="proformas-filtros-buscar"
    className="mt-3 border-t border-border pt-3" />;
}

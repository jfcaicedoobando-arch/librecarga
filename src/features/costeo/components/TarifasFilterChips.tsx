/**
 * Chips removibles para filtros activos de tarifas marítimas.
 * v13.135.48
 */
import { ActiveFilterChips } from "@/components/shared/ActiveFilterChips";
import type { EstadoFiltro, AprobacionFiltro } from "../routes/CosteoTarifas.helpers";

interface OpcionId { id: string; nombre?: string; name?: string }

interface Props {
  estado: EstadoFiltro;
  aprobacion: AprobacionFiltro;
  agenteId: string;
  tipoId: string;
  busqueda: string;
  soloPorVencer?: boolean;
  onClearPorVencer?: () => void;
  agentes: OpcionId[];
  tipos: OpcionId[];
  onClearEstado: () => void;
  onClearAprobacion: () => void;
  onClearAgente: () => void;
  onClearTipo: () => void;
  onClearBusqueda: () => void;
  onClearAll: () => void;
}

const aprobLabels: Record<AprobacionFiltro, string> = {
  borrador: "Pendientes",
  vigente: "Aprobadas",
  programada: "Programadas",
  rechazada: "Rechazadas",
  todas: "Todas",
};

const estadoLabels: Record<EstadoFiltro, string> = {
  vigente: "Vigentes hoy",
  vencida: "Vencidas",
  reemplazada: "Reemplazadas",
  todas: "Todas",
};

function chipPorVencer(p: Props) {
  return p.soloPorVencer && p.onClearPorVencer
    ? { key: "pv", label: "Por vencer ≤ 7 días", remove: p.onClearPorVencer }
    : null;
}

export function TarifasFilterChips(props: Props) {
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  if (props.aprobacion !== "todas") {
    chips.push({ key: "ap", label: aprobLabels[props.aprobacion], remove: props.onClearAprobacion });
  }
  if (props.estado !== "todas") {
    chips.push({ key: "es", label: estadoLabels[props.estado], remove: props.onClearEstado });
  }
  const pv = chipPorVencer(props);
  if (pv) chips.push(pv);
  if (props.agenteId !== "todos") {
    const a = props.agentes.find((x) => x.id === props.agenteId);
    chips.push({ key: "ag", label: `Agente: ${a?.nombre ?? a?.name ?? "—"}`, remove: props.onClearAgente });
  }
  if (props.tipoId !== "todos") {
    const t = props.tipos.find((x) => x.id === props.tipoId);
    chips.push({ key: "tp", label: `Cont.: ${t?.name ?? t?.nombre ?? "—"}`, remove: props.onClearTipo });
  }
  if (props.busqueda.trim() !== "") {
    chips.push({ key: "bq", label: `“${props.busqueda.trim()}”`, remove: props.onClearBusqueda });
  }

  return <ActiveFilterChips chips={chips.map(({ key, label, remove }) => ({ key, label, onRemove: remove }))}
    title="Filtros activos:" searchId="filtro-buscar" onClearAll={props.onClearAll} />;
}

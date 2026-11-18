import { useState } from "react";
import { UnifiedFiltersBar } from "@/components/shared/filters/UnifiedFiltersBar";
import { estadoCompatibleConAceptadasSinEmbarque } from "@/features/cotizacion/domain/filtroAceptadasSinEmbarque";
import type { useCotizacionesPageController } from "@/features/cotizacion/hooks/useCotizacionesPageController";
import { EstadoSelect, ClienteSelect } from "./CotizacionesFilterSelects";
import { CotizacionesSecondaryFilters } from "./CotizacionesSecondaryFilters";

type Props = Pick<ReturnType<typeof useCotizacionesPageController>,
  "search" | "setSearch" | "filterEstado" | "filterCliente" | "clientes" |
  "soloAceptadasSinEmbarque" | "totalAceptadasSinEmbarque" | "filterSinCostos" |
  "incluirInactivas" | "setFilter" | "activeChips" | "activeCount" | "resetAll"
>;

const EMPTY_DRAFT = {
  estado: "todos", cliente: "todos", aceptadasSinEmbarque: "no",
  sinCostos: "no", incluirInactivas: "no",
};

type FilterDraft = typeof EMPTY_DRAFT;

function cambiarFiltro(current: FilterDraft, key: keyof FilterDraft, value: string): FilterDraft {
  const next = { ...current, [key]: value };
  if (next.aceptadasSinEmbarque === "si" && !estadoCompatibleConAceptadasSinEmbarque(next.estado)) {
    if (key === "estado") next.aceptadasSinEmbarque = "no";
    if (key === "aceptadasSinEmbarque") next.estado = EMPTY_DRAFT.estado;
  }
  return next;
}

export function CotizacionesFiltersBar(c: Props) {
  const applied = {
    estado: c.filterEstado,
    cliente: c.filterCliente,
    aceptadasSinEmbarque: c.soloAceptadasSinEmbarque ? "si" : "no",
    sinCostos: c.filterSinCostos ? "si" : "no",
    incluirInactivas: c.incluirInactivas ? "si" : "no",
  };
  const [draft, setDraft] = useState(applied);
  const setDraftFilter = (key: keyof FilterDraft, value: string) =>
    setDraft((current) => cambiarFiltro(current, key, value));
  const commit = (next: FilterDraft) => {
    for (const key of Object.keys(next) as (keyof FilterDraft)[]) {
      if (next[key] !== applied[key]) c.setFilter(key, next[key]);
    }
  };
  const setAppliedFilter = (key: keyof FilterDraft, value: string) =>
    commit(cambiarFiltro(applied, key, value));
  const primary = (values: FilterDraft, setFilter: typeof setDraftFilter) => (
    <>
      <EstadoSelect value={values.estado} onChange={(v) => setFilter("estado", v)} />
      <ClienteSelect value={values.cliente} onChange={(v) => setFilter("cliente", v)} clientes={c.clientes} />
    </>
  );

  return (
    <UnifiedFiltersBar
      search={c.search}
      onSearchChange={c.setSearch}
      searchPlaceholder="Buscar por folio, cliente o mercancía…"
      primary={primary(applied, setAppliedFilter)}
      sheetPrimary={primary(draft, setDraftFilter)}
      secondary={
        <CotizacionesSecondaryFilters
          soloAceptadasSinEmbarque={draft.aceptadasSinEmbarque === "si"}
          totalAceptadasSinEmbarque={c.totalAceptadasSinEmbarque}
          filterSinCostos={draft.sinCostos === "si"}
          incluirInactivas={draft.incluirInactivas === "si"}
          setFilter={setDraftFilter}
        />
      }
      onSheetOpenChange={(open) => { if (open) setDraft(applied); }}
      onApply={() => commit(draft)}
      onSheetClearAll={() => setDraft(EMPTY_DRAFT)}
      sheetActiveCount={Object.keys(draft).filter((key) =>
        draft[key as keyof typeof draft] !== EMPTY_DRAFT[key as keyof typeof draft]).length}
      chips={c.activeChips}
      activeCount={c.activeCount}
      onClearAll={c.resetAll}
    />
  );
}

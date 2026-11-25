/**
 * Filtros de Proformas — barra compacta con chips de activos.
 *
 * Homologa el patrón usado en `/embarques` (`EmbarquesFiltros`):
 *   Desktop (lg+): [Search][Estado][Cliente][Filtros (N)]
 *                  N = secundarios activos (Operador + rango fecha).
 *   Mobile  (<lg): [Search][Filtros (N)]
 *                  N = TODOS los filtros activos.
 * Debajo se pintan chips con X individual y "Limpiar todo".
 */
import { useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import SearchInput from "@/components/shared/SearchInput";
import { MobileFiltersSheet } from "@/components/shared/MobileFiltersSheet";
import { ProformasFiltrosCampos } from "./ProformasFiltrosCampos";
import { ProformasFiltrosChips } from "./ProformasFiltrosChips";

interface ClienteOption { id: string; nombre: string }

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
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
  operadores: string[];
  onClearAll: () => void;
}

const filtrosVacios = { filtroEstado: "todas", filtroCliente: "todos", filtroOperador: "todos", fechaDesde: "", fechaHasta: "" };

function countActive(v: typeof filtrosVacios): number {
  let n = 0;
  if (v.filtroEstado && v.filtroEstado !== "todas") n++;
  if (v.filtroCliente && v.filtroCliente !== "todos") n++;
  if (v.filtroOperador && v.filtroOperador !== "todos") n++;
  if (v.fechaDesde) n++;
  if (v.fechaHasta) n++;
  return n;
}

export default function ProformasFiltros(props: Props) {
  const desktop = useMediaQuery("(min-width: 1024px)", { initializeWithValue: false });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState(filtrosVacios);
  const { filtroEstado, filtroCliente, filtroOperador, fechaDesde, fechaHasta } = props;
  const current = { filtroEstado, filtroCliente, filtroOperador, fechaDesde, fechaHasta };
  const visibleFilters = (value: typeof filtrosVacios) => desktop
    ? { ...value, filtroEstado: "todas", filtroCliente: "todos" }
    : value;

  const applyDraft = () => {
    if (!desktop && draft.filtroEstado !== filtroEstado) props.onFiltroEstadoChange(draft.filtroEstado);
    if (!desktop && draft.filtroCliente !== filtroCliente) props.onFiltroClienteChange(draft.filtroCliente);
    if (draft.filtroOperador !== filtroOperador) props.onFiltroOperadorChange(draft.filtroOperador);
    if (draft.fechaDesde !== fechaDesde) props.onFechaDesdeChange(draft.fechaDesde);
    if (draft.fechaHasta !== fechaHasta) props.onFechaHastaChange(draft.fechaHasta);
  };

  return (
    <div className="space-y-0">
      <div className="flex items-center gap-2">
        {desktop ? <ProformasFiltrosCampos {...props} layout="inline" /> : (
          <SearchInput id="proformas-filtros-buscar" value={props.search} onChange={props.onSearchChange}
            placeholder="Buscar proformas…" aria-label="Buscar proformas" className="flex-1 min-w-0" />
        )}
        <MobileFiltersSheet
          title="Filtros de proformas"
          open={sheetOpen}
          onOpenChange={(open) => {
            if (open) setDraft(current);
            setSheetOpen(open);
          }}
          activeCount={countActive(visibleFilters(current))}
          selectionCount={countActive(visibleFilters(draft))}
          onClearAll={() => setDraft(desktop ? { ...filtrosVacios, filtroEstado, filtroCliente } : filtrosVacios)}
          onApply={applyDraft}
        >
          <ProformasFiltrosCampos
            {...props} {...draft}
            onFiltroEstadoChange={(value) => setDraft((prev) => ({ ...prev, filtroEstado: value }))}
            onFiltroClienteChange={(value) => setDraft((prev) => ({ ...prev, filtroCliente: value }))}
            onFiltroOperadorChange={(value) => setDraft((prev) => ({ ...prev, filtroOperador: value }))}
            onFechaDesdeChange={(value) => setDraft((prev) => ({ ...prev, fechaDesde: value }))}
            onFechaHastaChange={(value) => setDraft((prev) => ({ ...prev, fechaHasta: value }))}
            layout={desktop ? "stacked-secondary" : "stacked-all"}
          />
        </MobileFiltersSheet>
      </div>
      <ProformasFiltrosChips {...props} />
    </div>
  );
}

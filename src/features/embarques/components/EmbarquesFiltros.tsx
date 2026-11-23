/**
 * Filtros de Embarques — migrado a `<UnifiedFiltersBar>` (Oleada 1).
 *
 * Primary: Estado + Cliente, dentro del panel en móvil.
 * Secondary (Sheet): Modo, Operador, ETD desde, ETA hasta.
 * Chips activos generados de los valores actuales del filtro.
 */
import { useId, useState } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import { UnifiedFiltersBar } from "@/components/shared/filters/UnifiedFiltersBar";
import { useIsMobile } from "@/hooks/shared";
import type { ChipItem } from "@/hooks/shared/useTableFilters";
import { ModoIcon } from "@/components/shared/ModoIcon";
import { ESTADOS_EMBARQUE, MODOS_TRANSPORTE } from "@/features/embarques/constants/embarqueConstants";
import { labelEstadoEmbarque } from "@/features/embarques/constants/estadoEmbarqueLabels";
import {
  EMBARQUES_FILTER_DEFAULTS, EMBARQUES_SECONDARY_FILTER_DEFAULTS, type EmbarquesFilterValues,
} from "@/features/embarques/hooks/useEmbarquesFilters";
import { formatDate } from "@/lib/formatters";
import { rangoLabel } from "@/lib/ui/rangoFechasCopy";

const ESTADOS_FILTRO = ESTADOS_EMBARQUE.flatMap((estado) =>
  estado === "Arribo" ? ["En Proceso", estado] : [estado],
);

interface ClienteOption { id: string; nombre: string }

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  onClearAll: () => void;
  onApplyFilters: (values: Partial<EmbarquesFilterValues>) => void;
  filterModo: string;
  onFilterModoChange: (v: string) => void;
  filterEstado: string;
  onFilterEstadoChange: (v: string) => void;
  filterCliente: string;
  onFilterClienteChange: (v: string) => void;
  filterOperador: string;
  onFilterOperadorChange: (v: string) => void;
  fechaDesde: string;
  onFechaDesdeChange: (v: string) => void;
  fechaHasta: string;
  onFechaHastaChange: (v: string) => void;
  clientes: ClienteOption[];
  operadores: string[];
}

export default function EmbarquesFiltros(props: Props) {
  const isMobile = useIsMobile();
  const idFechas = useId();
  const etdId = `${idFechas}-etd`;
  const etaId = `${idFechas}-eta`;
  const {
    search, onSearchChange, onClearAll, onApplyFilters,
    filterModo, filterEstado, filterCliente, filterOperador,
    fechaDesde, fechaHasta,
    onFilterModoChange, onFilterEstadoChange, onFilterClienteChange,
    onFilterOperadorChange, onFechaDesdeChange, onFechaHastaChange,
    clientes, operadores,
  } = props;

  const aplicados = {
    modo: filterModo, estado: filterEstado, cliente: filterCliente,
    operador: filterOperador, fechaDesde, fechaHasta,
  };
  const [borrador, setBorrador] = useState(aplicados);
  const setBorradorCampo = (key: keyof EmbarquesFilterValues, value: string) =>
    setBorrador((prev) => ({ ...prev, [key]: value }));
  const defaultsPanel = isMobile ? EMBARQUES_FILTER_DEFAULTS : EMBARQUES_SECONDARY_FILTER_DEFAULTS;
  const clavesPanel = Object.keys(defaultsPanel) as (keyof EmbarquesFilterValues)[];
  const cuentaActivosPanel = (values: EmbarquesFilterValues) =>
    clavesPanel.filter((key) => values[key] !== EMBARQUES_FILTER_DEFAULTS[key]).length;
  const aplicarBorrador = () => {
    const seleccion = Object.fromEntries(clavesPanel.map((key) => [key, borrador[key]]));
    onApplyFilters(seleccion);
  };

  // Chips activos (UnifiedFiltersBar maneja search aparte)
  const chips: ChipItem[] = [];
  if (filterEstado !== "todos") {
    chips.push({ key: "estado", label: `Estado: ${filterEstado}`, onRemove: () => onFilterEstadoChange("todos") });
  }
  if (filterCliente !== "todos") {
    const nombre = clientes.find((c) => c.id === filterCliente)?.nombre ?? filterCliente;
    chips.push({ key: "cliente", label: `Cliente: ${nombre}`, onRemove: () => onFilterClienteChange("todos") });
  }
  if (filterModo !== "todos") {
    chips.push({ key: "modo", label: `Modo: ${filterModo}`, onRemove: () => onFilterModoChange("todos") });
  }
  if (filterOperador !== "todos") {
    chips.push({ key: "operador", label: `Operador: ${filterOperador}`, onRemove: () => onFilterOperadorChange("todos") });
  }
  if (fechaDesde) {
    chips.push({ key: "desde", label: `ETD desde: ${formatDate(fechaDesde)}`, onRemove: () => onFechaDesdeChange("") });
  }
  if (fechaHasta) {
    chips.push({ key: "hasta", label: `ETA hasta: ${formatDate(fechaHasta)}`, onRemove: () => onFechaHastaChange("") });
  }

  const primarios = (
    valores: Pick<EmbarquesFilterValues, "estado" | "cliente">,
    onEstadoChange: (v: string) => void,
    onClienteChange: (v: string) => void,
  ) => (
    <>
      <Select value={valores.estado} onValueChange={onEstadoChange}>
        <SelectTrigger className="w-[170px]" aria-label="Estado del embarque">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos los estados</SelectItem>
          {ESTADOS_FILTRO.map((e) => <SelectItem key={e} value={e}>{labelEstadoEmbarque(e)}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={valores.cliente} onValueChange={onClienteChange}>
        <SelectTrigger className="w-[210px]" aria-label="Cliente">
          <SelectValue placeholder="Cliente" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos los clientes</SelectItem>
          {clientes.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.nombre}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );

  return (
    <UnifiedFiltersBar
      search={search}
      onSearchChange={onSearchChange}
      searchPlaceholder="Buscar por expediente, cliente o mercancía…"
      chips={chips}
      activeCount={cuentaActivosPanel(aplicados)}
      onClearAll={onClearAll}
      onSheetOpenChange={(open) => { if (open) setBorrador(aplicados); }}
      onApply={aplicarBorrador}
      onSheetClearAll={() => setBorrador((prev) => ({ ...prev, ...defaultsPanel }))}
      sheetActiveCount={cuentaActivosPanel(borrador)}
      primary={primarios(aplicados, onFilterEstadoChange, onFilterClienteChange)}
      sheetPrimary={primarios(borrador, (v) => setBorradorCampo("estado", v), (v) => setBorradorCampo("cliente", v))}
      secondary={
        <div className="space-y-4">
          <FieldGroup label="Modo de transporte">
            <Select value={borrador.modo} onValueChange={(v) => setBorradorCampo("modo", v)}>
              <SelectTrigger className="w-full" aria-label="Modo de transporte">
                <SelectValue placeholder="Modo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los modos</SelectItem>
                {MODOS_TRANSPORTE.map((m) => (
                  <SelectItem key={m} value={m}>
                    <span className="inline-flex items-center gap-2">
                      <ModoIcon modo={m} size={14} /> {m}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldGroup>
          <FieldGroup label="Operador">
            <Select value={borrador.operador} onValueChange={(v) => setBorradorCampo("operador", v)}>
              <SelectTrigger className="w-full" aria-label="Operador">
                <SelectValue placeholder="Operador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los operadores</SelectItem>
                {operadores.map((op) => <SelectItem key={op} value={op}>{op}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldGroup>
          <FieldGroup label={rangoLabel("ETD", "desde")} htmlFor={etdId}>
            <DatePickerMx id={etdId} value={borrador.fechaDesde} onChange={(v) => setBorradorCampo("fechaDesde", v)} className="w-full" />
          </FieldGroup>
          <FieldGroup label={rangoLabel("ETA", "hasta")} htmlFor={etaId}>
            <DatePickerMx id={etaId} value={borrador.fechaHasta} onChange={(v) => setBorradorCampo("fechaHasta", v)} className="w-full" />
          </FieldGroup>
        </div>
      }
    />
  );
}

function FieldGroup({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-body-sm font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

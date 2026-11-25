/**
 * Toolbar de la bandeja CxP — Por capturar.
 * Buscador, chips de filtro, ordenamiento y contador.
 */
import { ArrowDownAZ, ArrowUpZA, X } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import SearchInput from "@/components/shared/SearchInput";
import { Button } from "@/components/ui/button";
import { pluralizar } from "@/lib/format/pluralizar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type {
  AntiguedadFiltro, EstatusFiltro, FiltersState, OrdenarPor,
} from "@/features/bandejas/hooks/useCxpPorCapturarFilters";

interface Props {
  state: FiltersState;
  set: <K extends keyof FiltersState>(k: K, v: FiltersState[K]) => void;
  toggleDireccion: () => void;
  reset: () => void;
  isFiltered: boolean;
  totalFiltradas: number;
  totalGlobal: number;
}

const ESTATUS: { value: EstatusFiltro; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "sin", label: "Sin facturas" },
  { value: "parcial", label: "Parciales" },
  { value: "completo", label: "Completas" },
];

const ANTIGUEDAD: { value: AntiguedadFiltro; label: string }[] = [
  { value: "todos", label: "Todas" },
  { value: "sin_captura", label: "Sin captura" },
  { value: "gt7", label: ">7 días" },
  { value: "gt30", label: ">30 días" },
];

function ChipGroup<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}:</span>
      <ToggleGroup type="single" value={value} aria-label={label} className="flex-wrap justify-start"
        onValueChange={(next) => {
          const option = options.find((item) => item.value === next);
          if (option) onChange(option.value);
        }}>
        {options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="min-h-11 md:min-h-8">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export function CxpPorCapturarToolbar({
  state, set, toggleDireccion, reset, isFiltered, totalFiltradas, totalGlobal,
}: Props) {
  return (
    <div className="space-y-3 rounded-lg border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          aria-label="Buscar por expediente o cliente"
          value={state.query}
          onChange={(query) => set("query", query)}
          placeholder="Buscar por expediente o cliente…"
          className="w-full md:w-auto md:flex-1 md:min-w-[220px]"
        />

        <Select value={state.ordenarPor} onValueChange={(v) => set("ordenarPor", v as OrdenarPor)}>
          <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="antiguedad">Antigüedad</SelectItem>
            <SelectItem value="expediente">Expediente</SelectItem>
            <SelectItem value="monto">Monto</SelectItem>
            <SelectItem value="facturas"># Facturas</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={toggleDireccion}
          className="h-9"
          aria-label={`Orden ${state.direccion === "asc" ? "ascendente" : "descendente"}`}
        >
          {state.direccion === "asc"
            ? <ArrowDownAZ className="h-4 w-4" />
            : <ArrowUpZA className="h-4 w-4" />}
        </Button>

        <div className="ml-auto text-xs text-muted-foreground tabular-nums">
          {isFiltered ? `${totalFiltradas} de ${totalGlobal} ${pluralizar(totalGlobal, "embarque", { includeCount: false })}` : pluralizar(totalGlobal, "embarque")}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <ChipGroup<EstatusFiltro>
          label="Estatus"
          value={state.estatus}
          options={ESTATUS}
          onChange={(v) => set("estatus", v)}
        />
        <ChipGroup<AntiguedadFiltro>
          label="Última factura"
          value={state.antiguedad}
          options={ANTIGUEDAD}
          onChange={(v) => set("antiguedad", v)}
        />
        {isFiltered && (
          <Button variant="ghost" size="sm" onClick={reset} className="h-7 ml-auto">
            <X className="h-3 w-3 mr-1" /> Limpiar filtros
          </Button>
        )}
      </div>
    </div>
  );
}

;

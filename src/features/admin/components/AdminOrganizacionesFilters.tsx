import SearchInput from "@/components/shared/SearchInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  search: string;
  onSearchChange: (v: string) => void;
  planFilter: string;
  onPlanChange: (v: string) => void;
  estadoFilter: string;
  onEstadoChange: (v: string) => void;
  planes: string[];
}

export function AdminOrganizacionesFilters({
  search,
  onSearchChange,
  planFilter,
  onPlanChange,
  estadoFilter,
  onEstadoChange,
  planes,
}: Props) {
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder="Buscar por nombre o RFC…"
        aria-label="Buscar organizaciones"
        className="flex-1 min-w-[200px]"
      />
      <Select value={planFilter} onValueChange={onPlanChange}>
        <SelectTrigger className="w-full sm:w-[160px]" aria-label="Filtrar por plan">
          <SelectValue placeholder="Plan" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos los planes</SelectItem>
          {planes.map((p) => (
            <SelectItem key={p} value={p}>{p}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={estadoFilter} onValueChange={onEstadoChange}>
        <SelectTrigger className="w-full sm:w-[160px]" aria-label="Filtrar por estado">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos los estados</SelectItem>
          <SelectItem value="activas">Activas</SelectItem>
          <SelectItem value="inactivas">Inactivas</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

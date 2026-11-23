import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  sortKey: string | null;
  sortDir: "asc" | "desc";
  onClear: () => void;
  onSortChange: (key: string, dir: "asc" | "desc") => void;
}

const SORT_LABEL_MAP: Record<string, string> = {
  expediente: "Expediente",
  cliente: "Cliente",
  modo: "Modo",
  estado: "Estado",
  etd: "ETD",
  eta: "ETA",
  operador: "Operador",
  created_at: "Fecha de alta",
};

export function EmbarquesSortIndicator({ sortKey, sortDir, onClear, onSortChange }: Props) {
  const key = sortKey && Object.hasOwn(SORT_LABEL_MAP, sortKey) ? sortKey : "expediente";
  const label = `Ordenado por ${SORT_LABEL_MAP[key]} ${sortDir === "asc" ? "↑" : "↓"} · global`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2 text-body-sm text-muted-foreground">
      <span className="hidden md:inline">{label}</span>
      <div className="grid w-full grid-cols-2 gap-2 md:hidden">
        <Select value={key} onValueChange={(value) => onSortChange(value, sortDir)}>
          <SelectTrigger aria-label="Ordenar embarques por" className="min-w-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABEL_MAP).map(([value, name]) => <SelectItem key={value} value={value}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sortDir} onValueChange={(dir: "asc" | "desc") => onSortChange(key, dir)}>
          <SelectTrigger aria-label="Dirección del orden" className="min-w-0"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Ascendente</SelectItem>
            <SelectItem value="desc">Descendente</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="h-9 gap-1 px-2 text-body-sm"
      >
        <X className="h-3 w-3" />
        Restablecer orden
      </Button>
    </div>
  );
}

/**
 * Barra de trabajo del Buzón de facturas de proveedor.
 * v13.365.0 — Búsqueda, chips de filtro, orden y contador.
 */
import { Button } from "@/components/ui/button";
import SearchInput from "@/components/shared/SearchInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CHIPS_BUZON,
  ORDENES_BUZON,
  type ChipBuzon,
  type OrdenBuzon,
} from "@/features/bandejas/domain/facturasEntrantesBuzon";

interface Props {
  q: string;
  onQChange: (valor: string) => void;
  chip: ChipBuzon;
  onChipChange: (chip: ChipBuzon) => void;
  orden: OrdenBuzon;
  onOrdenChange: (orden: OrdenBuzon) => void;
  visibles: number;
  total: number;
}

export function FacturasEntrantesToolbar({
  q,
  onQChange,
  chip,
  onChipChange,
  orden,
  onOrdenChange,
  visibles,
  total,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        value={q}
        onChange={onQChange}
        placeholder="Proveedor, expediente, folio o archivo"
        className="w-full md:max-w-xs"
        aria-label="Buscar documentos del buzón"
      />

      <div className="flex flex-wrap items-center gap-1">
        {CHIPS_BUZON.map((opcion) => (
          <Button
            key={opcion.id}
            size="sm"
            variant={chip === opcion.id ? "default" : "outline"}
            onClick={() => onChipChange(opcion.id)}
          >
            {opcion.label}
          </Button>
        ))}
      </div>

      <Select value={orden} onValueChange={(v) => onOrdenChange(v as OrdenBuzon)}>
        <SelectTrigger className="h-9 w-full md:w-[200px]" aria-label="Ordenar documentos">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ORDENES_BUZON.map((opcion) => (
            <SelectItem key={opcion.id} value={opcion.id}>{opcion.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex w-full items-center gap-2 md:ml-auto md:w-auto">
        <span className="text-xs text-muted-foreground">
          {visibles} de {total} documento{total === 1 ? "" : "s"}
        </span>
        {(chip !== "todos" || q.trim() !== "") && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onQChange("");
              onChipChange("todos");
            }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>
    </div>
  );
}


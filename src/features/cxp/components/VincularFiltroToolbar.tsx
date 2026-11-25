/**
 * Toolbar de filtro para la lista de conceptos_costo pendientes en
 * `VincularEmbarqueSection`. Puro presentacional.
 */
import { X } from "lucide-react";
import SearchInput from "@/components/shared/SearchInput";
import { Button } from "@/components/ui/button";

interface Props {
  filtro: string;
  onFiltro: (v: string) => void;
  soloMarcados: boolean;
  onSoloMarcados: (v: boolean) => void;
  visibles: number;
  total: number;
}

export function VincularFiltroToolbar({
  filtro, onFiltro, soloMarcados, onSoloMarcados, visibles, total,
}: Props) {
  const filtroActivo = filtro.trim().length > 0 || soloMarcados;
  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput
          value={filtro}
          onChange={onFiltro}
          placeholder="Filtrar por concepto, expediente o monto…"
          className="min-w-[200px] flex-1"
          inputClassName="text-body md:h-8"
          aria-label="Filtrar conceptos por texto"
        />
        <Button
          type="button"
          variant={soloMarcados ? "default" : "outline"}
          size="sm"
          className="h-8"
          onClick={() => onSoloMarcados(!soloMarcados)}
        >
          Sólo marcados
        </Button>
        {filtroActivo && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => { onFiltro(""); onSoloMarcados(false); }}
          >
            <X className="h-3.5 w-3.5 mr-1" /> Limpiar
          </Button>
        )}
      </div>
      {filtroActivo && (
        <p className="text-body-sm text-muted-foreground">
          Mostrando {visibles} de {total} concepto{total === 1 ? "" : "s"}
        </p>
      )}
    </>
  );
}

/**
 * Buscador de embarque para ligar un anticipo a un expediente.
 * Reutiliza la búsqueda por texto ya usada al capturar facturas de proveedor
 * (`useBuscarEmbarquesPorTexto`), sin sugerencias automáticas: aquí el
 * operador sabe de qué expediente es el dinero adelantado.
 */
import { useState } from "react";
import { Loader2, X, Ship } from "lucide-react";
import SearchInput from "@/components/shared/SearchInput";
import { Badge } from "@/components/ui/badge";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { Button } from "@/components/ui/button";
import { useDebounce } from "@/hooks/shared";
import { useBuscarEmbarquesPorTexto } from "@/features/cxp/hooks";
import { useOrgActiva } from "@/hooks/shared/useOrgActiva";

interface Props {
  /** Embarque seleccionado (id) o null. */
  value: string | null;
  /** Expediente del embarque seleccionado, para mostrarlo sin re-consultar. */
  expediente: string | null;
  onChange: (embarqueId: string | null, expediente: string | null) => void;
}

function estadoBusqueda(term: string, debounced: string, consulta: ReturnType<typeof useBuscarEmbarquesPorTexto>) {
  if (term.trim().length < 2) return "inicial";
  if (debounced !== term || consulta.isLoading) return "cargando";
  if (consulta.isError) return "error";
  return consulta.data?.length ? "resultados" : "vacio";
}

export function EmbarqueAnticipoPicker({ value, expediente, onChange }: Props) {
  const { organizationId } = useOrgActiva();
  const [term, setTerm] = useState("");
  const debounced = useDebounce(term, 300);
  const search = useBuscarEmbarquesPorTexto(debounced, organizationId, term.trim().length >= 2);
  const estado = estadoBusqueda(term, debounced, search);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/5 px-3 py-2">
        <Ship className="h-4 w-4 text-success" />
        <span className="text-sm">Ligado al expediente</span>
        <Badge variant="outline" className="font-mono">{expediente ?? value.slice(0, 8)}</Badge>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto h-7"
          onClick={() => { onChange(null, null); setTerm(""); }}
        >
          <X className="mr-1 h-3.5 w-3.5" /> Quitar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <SearchInput
        value={term}
        onChange={setTerm}
        placeholder="Buscar por expediente, BL o cliente…"
        aria-label="Buscar embarque para el anticipo"
        inputClassName="md:h-9"
      />

      {estado === "cargando" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Buscando embarques…
        </div>
      )}

      {estado === "error" && (
        <ErrorStateInline
          title="No se pudieron consultar los embarques"
          message="Reintenta la búsqueda con el texto capturado."
          onRetry={() => void search.refetch()}
          retrying={search.isFetching}
        />
      )}
      {estado === "vacio" && (
        <p className="text-xs italic text-muted-foreground">
          No encontramos embarques con ese texto (los cerrados y cancelados no se muestran).
        </p>
      )}

      {estado === "resultados" && (
        <div className="max-h-48 space-y-1.5 overflow-y-auto">
          {search.data?.map((e) => (
            <Button
              key={e.embarque_id}
              type="button"
              variant="ghost"
              aria-label={`Seleccionar embarque ${e.expediente ?? e.embarque_id.slice(0, 8)}`}
              onClick={() => onChange(e.embarque_id, e.expediente ?? null)}
              className="h-auto w-full justify-start whitespace-normal rounded-md border bg-background px-3 py-2 text-left font-normal transition-colors hover:border-accent hover:bg-accent/5"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="font-mono font-medium">{e.expediente ?? "—"}</span>
                <span className="truncate text-muted-foreground">· {e.cliente_nombre ?? "Sin cliente"}</span>
                {e.estado && <Badge variant="secondary" className="ml-auto text-xs">{e.estado}</Badge>}
              </div>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

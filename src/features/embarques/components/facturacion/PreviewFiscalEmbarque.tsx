import type { UseQueryResult } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { ConceptoVentaLocal } from "@/types/concepto";
import { usePreviewFiscalEmbarque } from "../../hooks/useFiscalEmbarque";
import { DesgloseFiscalEmbarque } from "./DesgloseFiscalEmbarque";
import type { SnapshotFiscalCotizacion } from "@/features/cotizacion/domain/snapshotFiscalCotizacion";

function ResultadoPreview({ vigente, query }: { vigente: boolean; query: UseQueryResult<SnapshotFiscalCotizacion | null> }) {
  if (!vigente) return <p role="status">Actualiza el desglose fiscal con los datos actuales.</p>;
  if (query.isFetching) return <p role="status">Calculando desglose fiscal…</p>;
  if (query.isError) return <p role="alert">No se pudo calcular el desglose fiscal. Intenta nuevamente.</p>;
  if (!query.isSuccess) return null;
  return query.data ? <DesgloseFiscalEmbarque fiscal={query.data} preview />
    : <p role="status">Este embarque conserva el flujo fiscal anterior.</p>;
}

export function PreviewFiscalEmbarque({ conceptos, clienteId, embarqueId }: {
  conceptos: ConceptoVentaLocal[]; clienteId: string; embarqueId?: string;
}) {
  const { puedeConsultar, vigente, query, solicitar } = usePreviewFiscalEmbarque({ conceptos, clienteId, embarqueId });
  return <div className="space-y-3">
    <Button type="button" variant="outline" disabled={!puedeConsultar || (vigente && query.isFetching)} onClick={solicitar}>
      Actualizar desglose fiscal
    </Button>
    <ResultadoPreview vigente={vigente} query={query} />
  </div>;
}

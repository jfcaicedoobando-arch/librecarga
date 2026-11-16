import { Button } from "@/components/ui/button";
import { useFiscalEmbarqueGuardado } from "../../hooks/useFiscalEmbarque";
import { DesgloseFiscalEmbarque } from "./DesgloseFiscalEmbarque";

export function FiscalEmbarqueGuardado({ embarqueId, revision }: { embarqueId: string; revision: string }) {
  const { disponible, query } = useFiscalEmbarqueGuardado(embarqueId, revision);
  if (!disponible) return null;
  if (query.isError) return <div role="alert" className="p-4">No se pudo cargar el desglose fiscal. <Button variant="outline" onClick={() => void query.refetch()}>Reintentar</Button></div>;
  if (query.isPending || query.isFetching) return <p role="status" className="p-4">Consultando desglose fiscal…</p>;
  return query.data ? <DesgloseFiscalEmbarque fiscal={query.data} /> : null;
}

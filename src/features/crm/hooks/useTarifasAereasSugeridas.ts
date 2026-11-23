import { useQuery } from "@tanstack/react-query";
import { hoyMx } from "@/lib/date/mx";
import { crm } from "../queryKeys";
import { fechaVigenciaSolicitud } from "../services/pricing/fechaVigenciaSolicitud";
import { listarTarifasAereasSugeridas } from "../services/pricing/tarifasAereasSugeridas";

export function useTarifasAereasSugeridas(organizationId: string, origen: string | null, destino: string | null, fechaCarga?: string | null) {
  const hoy = fechaVigenciaSolicitud(fechaCarga, hoyMx());
  return useQuery({
    queryKey: crm.tarifasAereasSugeridas(organizationId, origen, destino, hoy),
    queryFn: () => listarTarifasAereasSugeridas(organizationId, origen!, destino!, hoy),
    enabled: !!origen && !!destino,
  });
}

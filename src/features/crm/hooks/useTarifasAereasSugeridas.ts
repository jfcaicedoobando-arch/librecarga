import { useQuery } from "@tanstack/react-query";
import { fechaVigenciaCarga as fechaVigencia } from "@/lib/date/fechaVigenciaCarga";
import { crm } from "../queryKeys";
import { listarTarifasAereasSugeridas } from "../services/pricing/tarifasAereasSugeridas";

export function useTarifasAereasSugeridas(organizationId: string, origen: string | null, destino: string | null, fechaCarga: string | null) {
  const fecha = fechaVigencia(fechaCarga);
  return useQuery({
    queryKey: crm.tarifasAereasSugeridas(organizationId, origen, destino, fecha),
    queryFn: () => {
      if (!origen || !destino) return [];
      return listarTarifasAereasSugeridas(organizationId, origen, destino, fecha);
    },
    enabled: !!origen && !!destino,
  });
}

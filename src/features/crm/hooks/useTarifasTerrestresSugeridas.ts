import { useQuery } from "@tanstack/react-query";
import { fechaVigenciaCarga as fechaVigencia } from "@/lib/date/fechaVigenciaCarga";
import { crm } from "../queryKeys";
import { listarTarifasTerrestresSugeridas, type CriterioTerrestre } from "../services/pricing/tarifasTerrestresSugeridas";

export { fechaVigenciaCarga as fechaVigencia } from "@/lib/date/fechaVigenciaCarga";

export function useTarifasTerrestresSugeridas(organizationId: string, criterio: CriterioTerrestre | null, fechaCarga: string | null) {
  const fecha = fechaVigencia(fechaCarga);
  return useQuery({
    queryKey: crm.tarifasTerrestresSugeridas(organizationId, criterio, fecha),
    queryFn: () => {
      if (!criterio) return [];
      return listarTarifasTerrestresSugeridas(organizationId, criterio, fecha);
    },
    enabled: criterio != null,
  });
}

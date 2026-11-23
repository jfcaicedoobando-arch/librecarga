import { useQuery } from "@tanstack/react-query";
import { hoyMx } from "@/lib/date/mx";
import { crm } from "../queryKeys";
import { listarTarifasTerrestresSugeridas, type CriterioTerrestre } from "../services/pricing/tarifasTerrestresSugeridas";

/** Vigencia contra la fecha tentativa de carga si es futura; si no, hoy (igual que la base). */
export function fechaVigencia(fechaCarga: string | null | undefined, hoy = hoyMx()): string {
  return fechaCarga && /^\d{4}-\d{2}-\d{2}/.test(fechaCarga) && fechaCarga.slice(0, 10) > hoy ? fechaCarga.slice(0, 10) : hoy;
}

export function useTarifasTerrestresSugeridas(organizationId: string, criterio: CriterioTerrestre | null, fechaCarga: string | null) {
  const fecha = fechaVigencia(fechaCarga);
  return useQuery({
    queryKey: crm.tarifasTerrestresSugeridas(organizationId, criterio, fecha),
    queryFn: () => listarTarifasTerrestresSugeridas(organizationId, criterio!, fecha),
    enabled: criterio != null,
  });
}

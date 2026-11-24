/**
 * Conteo de cotizaciones propias pendientes de re-aprobación de tarifa.
 * Filtradas por `operador = <email actual>` (dashboard comercial).
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/contexts/AuthContext";
import { useOrgFilter } from "@/hooks/shared/useOrgFilter";
import { hasRouteAccess } from "@/lib/access/roleRouteMatrix";
import {
  contarMisCotizacionesPendientesReaprobacion,
} from "@/features/cotizacion/services/pendientesReaprobacion";
import { queryKeys } from "@/lib/query";

export function useMisCotizacionesPendientesReaprobacion() {
  const { user, effectiveRole } = useAuth();
  const { organizationId, orgListo } = useOrgFilter();
  const email = hasRouteAccess(effectiveRole, "/cotizaciones") ? user?.email ?? null : null;
  const orgId = orgListo ? organizationId : null;
  return useQuery<number>({
    queryKey: queryKeys.cotizaciones.pendientesReaprobacion.mias(email, orgId),
    enabled: Boolean(email && orgId),
    staleTime: 60_000,
    queryFn: () => email && orgId
      ? contarMisCotizacionesPendientesReaprobacion(email, orgId)
      : Promise.resolve(0),
  });
}

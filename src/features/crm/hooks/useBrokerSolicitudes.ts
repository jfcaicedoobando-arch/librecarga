import { useQuery } from "@tanstack/react-query";
import { useMutationWithFeedback } from "@/hooks/shared";
import { useOrgActiva } from "@/hooks/shared/useOrgActiva";
import { listarSolicitudesBroker, resolverSolicitudBroker } from "../services/brokerSolicitudes";

import { crm } from "../queryKeys";

export function useBrokerSolicitudes() {
  const { organizationId } = useOrgActiva();
  return useQuery({ queryKey: crm.brokerSolicitudes.list(organizationId), queryFn: listarSolicitudesBroker, enabled: !!organizationId });
}

export const useResolverSolicitudBroker = () =>
  useMutationWithFeedback({
    mutationFn: (v: { id: string; autorizar: boolean; motivo?: string }) =>
      resolverSolicitudBroker(v.id, v.autorizar, v.motivo),
    invalidate: [...crm.brokerSolicitudes.all],
    successTitle: "Solicitud resuelta",
    successDescription: "Avisamos al broker.",
    errorTitle: "No se pudo resolver la solicitud",
  });

import { useMutation, useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/lib/contexts/OrganizationContext";
import { queryKeys } from "@/lib/query";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { fetchCoordinadores } from "../services/coordinador";

export function useAsignacionCoordinador(
  onGuardar: (coordinadorId: string | null) => Promise<void>,
  onGuardado: () => void,
) {
  const { organizationId } = useOrganization();
  const opciones = useQuery({
    queryKey: queryKeys.cotizaciones.coordinadores(organizationId),
    enabled: Boolean(organizationId),
    queryFn: () => organizationId
      ? fetchCoordinadores(organizationId)
      : Promise.resolve({ opciones: [], nombres: new Map<string, string>() }),
  });
  const mutation = useMutation({
    mutationFn: onGuardar,
    onSuccess: () => {
      notifySuccess(undefined, { title: "Coordinador actualizado" });
      onGuardado();
    },
    onError: (error) => notifyError(undefined, { title: "No se pudo cambiar el coordinador", error }),
  });
  return { opciones, mutation };
}

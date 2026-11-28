import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/lib/contexts/OrganizationContext";
import { captureAuthDataScope } from "@/lib/auth/authOperationScope";
import { queryKeys } from "@/lib/query";
import { usePayloadRequestId } from "@/lib/idempotency";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { getErrorMessage } from "@/lib/errors";
import { historialFechaEntrega, resolverFechaEntrega, solicitarFechaEntrega } from "../services/fechasEntrega";

export function useFechasEntrega(embarque: string) {
  const { organizationId } = useOrganization();
  const qc = useQueryClient();
  const requestId = usePayloadRequestId();
  const scope = captureAuthDataScope();
  const key = [...queryKeys.embarques.all, "fechaEntrega", organizationId, scope.userId, scope.role, scope.generation, embarque];
  const reportes = ["reportes"] as const;
  const historial = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => historialFechaEntrega(embarque, signal),
    enabled: !!organizationId && scope.organizationId === organizationId,
  });

  const mutation = useMutation({
    mutationFn: async (input:
      | { fecha: string; motivo: string; documento: string }
      | { solicitud: string; aprobar: boolean; motivo: string }) => {
      scope.assertCurrent();
      if ("solicitud" in input) return resolverFechaEntrega(input.solicitud, input.aprobar, input.motivo);
      await solicitarFechaEntrega(embarque, input.fecha, input.motivo, input.documento, requestId.get(JSON.stringify(input)));
      return "pendiente";
    },
    onSuccess: (estado) => {
      if (!scope.isCurrent()) return;
      requestId.reset();
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: reportes });
      notifySuccess(undefined, { title: estado === "pendiente" ? "Solicitud registrada" : `Corrección ${estado}` });
    },
    onError: (error) => {
      if (scope.isCurrent()) notifyError(undefined, {
        title: "No se pudo guardar la corrección", description: getErrorMessage(error), error,
      });
    },
  });
  return { historial, mutation };
}

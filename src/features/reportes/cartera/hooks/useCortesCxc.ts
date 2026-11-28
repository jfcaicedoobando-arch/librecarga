import { useSyncExternalStore } from "react";
import { captureAuthDataScope } from "@/lib/auth/authOperationScope";
import { getSessionCacheGeneration, subscribeSessionCacheGeneration } from "@/lib/auth/sessionCacheRegistry";
import { useOrganization } from "@/lib/contexts/OrganizationContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePayloadRequestId } from "@/lib/idempotency";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/query";
import { carteraKeys } from "../queryKeys";
import { activarHistorialCxc, certificarCorteCxc, consultarAperturaCxc, consultarCorteCxc, previsualizarCorteCxc } from "../services/cortesCxc";

export function finDeMes(mes: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return "";
  const dia = new Date(`${mes}-01T00:00:00.000Z`);
  dia.setUTCMonth(dia.getUTCMonth() + 1, 0);
  return dia.toISOString().slice(0, 10);
}

function useCorteScope() {
  const scope = captureAuthDataScope();
  const { organizationId, loading } = useOrganization();
  const generation = useSyncExternalStore(subscribeSessionCacheGeneration, getSessionCacheGeneration);
  return {
    scope: { ...scope, generation },
    listo: !loading && !!organizationId && organizationId === scope.organizationId && scope.isCurrent(),
  };
}

export function useCorteCxc(fecha: string) {
  const { scope, listo } = useCorteScope();
  const corte = useQuery({
    queryKey: carteraKeys.corte(scope, fecha),
    queryFn: async ({ signal }) => {
      if (!scope.organizationId) throw new Error("Selecciona una organización.");
      const data = await consultarCorteCxc(scope.organizationId, fecha, signal);
      scope.assertCurrent();
      return data;
    },
    enabled: listo && !!fecha,
  });
  return { corte, scope, listo };
}

export function useCertificarCorteCxc(fecha: string) {
  const { scope, listo } = useCorteScope();
  const qc = useQueryClient();
  const req = usePayloadRequestId();
  const permitido = listo && scope.role === "contador";
  const apertura = useQuery({
    queryKey: carteraKeys.apertura(scope),
    queryFn: ({ signal }) => consultarAperturaCxc(scope.organizationId ?? "", signal),
    enabled: permitido,
  });
  const preview = useQuery({
    queryKey: carteraKeys.preview(scope, fecha),
    queryFn: ({ signal }) => previsualizarCorteCxc(scope.organizationId ?? "", fecha, signal),
    enabled: permitido && typeof apertura.data === "string" && !!fecha,
    retry: false,
  });
  const guardar = useMutation({
    mutationFn: async (datos:
      | { evidencia: string }
      | { fecha: string; fingerprint: string; evidencia: string }) => {
      scope.assertCurrent();
      if (!scope.organizationId) throw new Error("Selecciona una organización.");
      if (!("fecha" in datos)) {
        await activarHistorialCxc(scope.organizationId, datos.evidencia);
        return "Apertura conciliada registrada";
      }
      await certificarCorteCxc(scope.organizationId, datos.fecha, datos.fingerprint, datos.evidencia, req.get(JSON.stringify(datos)));
      return "Corte de CxC certificado";
    },
    onSuccess: (title) => {
      if (!scope.isCurrent()) return;
      req.reset();
      void qc.invalidateQueries({ queryKey: carteraKeys.historica(scope) });
      void qc.invalidateQueries({ queryKey: queryKeys.configuracion.all });
      notifySuccess(undefined, { title });
    },
    onError: (error) => {
      if (scope.isCurrent()) notifyError(undefined, {
        title: "No se pudo guardar el corte", description: getErrorMessage(error), error,
      });
    },
  });
  return { permitido, apertura, preview, guardar };
}

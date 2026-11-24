/**
 * Mutaciones de la Fase 5 de Pricing: estados de trabajo y modos por ejecutivo.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { useAuth } from "@/lib/contexts/AuthContext";
import { modoPorDefecto, type AccionFlujoPricing } from "@/features/crm/services/pricing/estadosPricing";
import { cambiarEstadoPricing, guardarModosEjecutivo, listarModosEjecutivo } from "@/features/crm/services/pricing/flujoPricing";
import { mensajeErrorPricing } from "@/features/crm/services/pricing/tiposPricing";
import { useInvalidarSolicitud } from "./useInvalidarSolicitud";

const LLAVE_MODOS = ["crm", "pricing", "modos-ejecutivo"] as const;
const TITULOS: Record<AccionFlujoPricing, string> = {
  tomar: "Solicitud asignada a ti", iniciar: "Solicitud en proceso", pedir_info: "Se pidió información; el plazo está en pausa",
  reanudar: "Solicitud reanudada", sin_opcion: "Solicitud cerrada sin opción",
};

export function useCambiarEstadoPricing() {
  const invalidar = useInvalidarSolicitud();
  return useMutation({
    retry: false,
    mutationFn: (v: { id: string; oportunidadId: string | null; accion: AccionFlujoPricing; motivo?: string }) =>
      cambiarEstadoPricing(v.id, v.accion, v.motivo),
    onSuccess: (_d, v) => {
      void invalidar(v.id, v.oportunidadId);
      notifySuccess(undefined, { title: TITULOS[v.accion] });
    },
    onError: (error, v) => notifyError(undefined, { title: "No se pudo actualizar la solicitud de Pricing",
      description: mensajeErrorPricing(error), error, method: "CRM_PRICING_FLUJO", context: { accion: v.accion } }),
  });
}

export function useModosEjecutivo() {
  return useQuery({ queryKey: LLAVE_MODOS, queryFn: listarModosEjecutivo });
}

export function useModoPropioPricing(): string {
  const { user } = useAuth();
  const { data } = useModosEjecutivo();
  return modoPorDefecto((data ?? []).filter((modo) => modo.user_id === user?.id).map((modo) => modo.modo));
}

export function useGuardarModosEjecutivo() {
  const qc = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (v: { userId: string; modos: string[] }) => guardarModosEjecutivo(v.userId, v.modos),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: LLAVE_MODOS }); },
    onError: (error) => notifyError(undefined, { title: "No se pudieron guardar los modos",
      description: mensajeErrorPricing(error), error, method: "CRM_PRICING_MODOS" }),
  });
}

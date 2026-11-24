import { useMutation } from "@tanstack/react-query";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { mensajeErrorPricing } from "@/features/crm/services/pricing/tiposPricing";
import { marcarPerdidaPricing } from "@/features/crm/services/pricing/perdidaPricing";
import { useInvalidarSolicitud } from "./useInvalidarSolicitud";

export function useMarcarPerdidaPricing() {
  const invalidar = useInvalidarSolicitud();
  return useMutation({
    retry: false,
    mutationFn: (v: { id: string; oportunidadId: string | null; motivoId: string; nota: string }) =>
      marcarPerdidaPricing(v.id, v.motivoId, v.nota),
    onSuccess: (_d, v) => {
      void invalidar(v.id, v.oportunidadId);
      notifySuccess(undefined, { title: "Motivo de pérdida guardado; se avisó al vendedor" });
    },
    onError: (error) => notifyError(undefined, { title: "No se pudo guardar el motivo de pérdida",
      description: mensajeErrorPricing(error), error, method: "CRM_PRICING_PERDIDA" }),
  });
}

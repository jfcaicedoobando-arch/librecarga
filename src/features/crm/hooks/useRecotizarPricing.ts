import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { mensajeErrorPricing } from "@/features/crm/services/pricing/tiposPricing";
import { useInvalidarSolicitud } from "./useInvalidarSolicitud";
import { crmPricingKeys } from "@/features/crm/queryKeys.performance";
import {
  leerCostoVsReal, listarSolicitudesCostoReal, listarVersionesPricing, recotizarPricing,
} from "@/features/crm/services/pricing/recotizarPricing";
import { agruparPorSolicitud } from "@/features/crm/services/pricing/costoVsRealPricing";

export function useVersionesPricing(solicitudId: string, activo: boolean) {
  return useQuery({ queryKey: crmPricingKeys.versiones(solicitudId), queryFn: () => listarVersionesPricing(solicitudId), enabled: activo });
}

export function useRecotizarPricing() {
  const qc = useQueryClient();
  const invalidar = useInvalidarSolicitud();
  return useMutation({
    retry: false,
    mutationFn: (v: { id: string; oportunidadId: string | null; motivo: string }) => recotizarPricing(v.id, v.motivo),
    onSuccess: (_d, v) => {
      void invalidar(v.id, v.oportunidadId);
      void qc.invalidateQueries({ queryKey: crmPricingKeys.versiones(v.id) });
      notifySuccess(undefined, { title: "Recotización iniciada: nueva versión en proceso" });
    },
    onError: (error) => notifyError(undefined, { title: "No se pudo recotizar la solicitud",
      description: mensajeErrorPricing(error), error, method: "CRM_PRICING_RECOTIZAR" }),
  });
}

export function useCostoVsReal(ids: string[]) {
  const clave = [...ids].sort().join(",");
  return useQuery({
    queryKey: crmPricingKeys.costoReal(clave),
    queryFn: async () => agruparPorSolicitud(await leerCostoVsReal(ids)),
    enabled: ids.length > 0,
  });
}

export function useListaCostoReal(pagina: number, modo: string, ejecutivo: string) {
  return useQuery({
    queryKey: crmPricingKeys.costoRealLista(pagina, modo, ejecutivo),
    queryFn: () => listarSolicitudesCostoReal(pagina, modo, ejecutivo),
    placeholderData: keepPreviousData,
  });
}

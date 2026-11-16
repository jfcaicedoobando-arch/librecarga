import { useMutationWithFeedback } from "@/hooks/shared/useMutationWithFeedback";
import { revisarFiscalCotizacion } from "../services/evaluarFiscalCotizacion";
import { cotizaciones, pdfPreviewCotizacion } from "../queryKeys";

export function useRevisionFiscalCotizacion(cotizacionId: string) {
  return useMutationWithFeedback({
    mutationFn: revisarFiscalCotizacion,
    invalidate: [cotizaciones.all, pdfPreviewCotizacion(cotizacionId)],
    successTitle: "Cotización devuelta a borrador",
    errorTitle: "No se pudo iniciar la revisión fiscal",
    errorMethod: "REVISAR_COTIZACION_FISCAL",
  });
}

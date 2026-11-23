/** Aplica una sola vez la tarifa aérea elegida en Pricing con el peso real y volumen de la solicitud. */
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UseFormReturn } from "react-hook-form";
import type { CotizacionFormValues } from "@/features/cotizacion/types";
import { cotizaciones } from "@/features/cotizacion/queryKeys";
import { fetchPrefillTarifaAerea } from "@/features/cotizacion/services/prefillTarifaAerea";
import { notifyError } from "@/lib/ui/appFeedback";

const OPTS = { shouldDirty: true, shouldValidate: true } as const;

export function usePrefillTarifaAerea(
  form: UseFormReturn<CotizacionFormValues>, organizationId: string | null | undefined,
  tarifaId: string | null, solicitudId: string | null, enabled: boolean,
) {
  const hecho = useRef(false);
  const activo = enabled && Boolean(organizationId && tarifaId && solicitudId);
  const q = useQuery({
    queryKey: cotizaciones.prefillTarifaAerea(organizationId, tarifaId, solicitudId),
    queryFn: () => fetchPrefillTarifaAerea(organizationId!, tarifaId!, solicitudId!),
    enabled: activo, retry: false,
  });
  useEffect(() => {
    if (!activo || hecho.current) return;
    if (q.isError) {
      hecho.current = true;
      notifyError(undefined, { title: "No se pudo abrir la tarifa aérea", error: q.error, method: "COTIZACION_PREFILL_TARIFA_AEREA" });
      return;
    }
    const p = q.data;
    if (!p) return;
    hecho.current = true;
    if (form.getValues("tarifaId")) return; // nunca pisa una tarifa ya elegida
    form.setValue("modo", "Aéreo", OPTS);
    form.setValue("monedaTarifa", p.moneda, OPTS);
    form.setValue("origen", p.origen, OPTS);
    form.setValue("destino", p.destino, OPTS);
    form.setValue("rutaTexto", `${p.origen} → ${p.destino}`, OPTS);
    if (p.pesoKg != null) form.setValue("pesoKg", p.pesoKg, OPTS);
    if (p.volumenM3 != null) form.setValue("volumenM3", p.volumenM3, OPTS);
    if (p.commodity && !form.getValues("descripcionMercancia")) form.setValue("descripcionMercancia", p.commodity, OPTS);
    const [y, m, d] = p.vigenteHasta.split("-").map(Number);
    const hasta = new Date(y, m - 1, d, 23, 59, 59, 999);
    const validez = form.getValues("validezPropuesta");
    if (validez && validez > hasta) form.setValue("validezPropuesta", hasta, OPTS);
    form.setValue("banderasAereas", p.banderasAereas, OPTS);
    form.setValue("tarifaId", p.tarifaId, OPTS); // al final: dispara la carga automática de costos
  }, [activo, q.data, q.isError, q.error, form]);
}

/** Aplica una sola vez la tarifa aérea o terrestre elegida en Pricing con el peso real y volumen de la solicitud. */
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { UseFormReturn } from "react-hook-form";
import type { CotizacionFormValues } from "@/features/cotizacion/types";
import { cotizaciones } from "@/features/cotizacion/queryKeys";
import { fetchPrefillTarifaAerea } from "@/features/cotizacion/services/prefillTarifaAerea";

const OPTS = { shouldDirty: true, shouldValidate: true } as const;

function acotarVigencia(form: UseFormReturn<CotizacionFormValues>, vigenteHasta: string) {
  const [y, m, d] = vigenteHasta.split("-").map(Number);
  const hasta = new Date(y, m - 1, d, 23, 59, 59, 999);
  const validez = form.getValues("validezPropuesta");
  if (validez && validez > hasta) form.setValue("validezPropuesta", hasta, OPTS);
}

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
    if (!activo || hecho.current || q.isError) return;
    const p = q.data;
    if (!p) return;
    hecho.current = true;
    if (form.getValues("tarifaId")) return; // nunca pisa una tarifa ya elegida
    form.setValue("modo", p.modo, OPTS);
    if (p.tipoUnidad && !form.getValues("tipoUnidad")) form.setValue("tipoUnidad", p.tipoUnidad, OPTS);
    if (p.puntoIntermedio && !form.getValues("puntoIntermedio")) form.setValue("puntoIntermedio", p.puntoIntermedio, OPTS);
    form.setValue("monedaTarifa", p.moneda, OPTS);
    form.setValue("origen", p.origen, OPTS);
    form.setValue("destino", p.destino, OPTS);
    form.setValue("rutaTexto", `${p.origen} → ${p.destino}`, OPTS);
    if (p.pesoKg != null) form.setValue("pesoKg", p.pesoKg, OPTS);
    if (p.volumenM3 != null) form.setValue("volumenM3", p.volumenM3, OPTS);
    if (p.commodity && !form.getValues("descripcionMercancia")) form.setValue("descripcionMercancia", p.commodity, OPTS);
    acotarVigencia(form, p.vigenteHasta);
    if (p.modo === "Aéreo") form.setValue("banderasAereas", p.banderasAereas, OPTS);
    form.setValue("tarifaId", p.tarifaId, OPTS); // al final: dispara la carga automática de costos
  }, [activo, q.data, q.isError, form]);

  if (!activo || q.data) return null;
  if (q.isError) {
    return { estado: "error", reintentando: q.isFetching, reintentar: () => void q.refetch() } as const;
  }
  return { estado: "cargando" } as const;
}

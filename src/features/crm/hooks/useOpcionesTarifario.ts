import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { hoyMx } from "@/lib/date/mx";
import {
  aplicarTarifaTarifario, costeoQueryKeys, listarCargos,
  listarTarifasTarifario, tarifasCoincidentes,
} from "@/features/costeo";
import { fechaVigenciaSolicitud } from "../services/pricing/fechaVigenciaSolicitud";
import type { SolicitudPricingRow } from "../services/pricing/tiposPricing";

export function useOpcionesTarifario(s: SolicitudPricingRow) {
  const qc = useQueryClient();
  // Vigencia al día de la carga, no al de hoy.
  const hoyReal = hoyMx();
  const hoy = fechaVigenciaSolicitud(s.fecha_tentativa_carga, hoyReal);
  const base = costeoQueryKeys.tarifario.tarifas("vigentes");
  const tarifas = useQuery({ queryKey: hoy === hoyReal ? base : [...base, hoy], queryFn: () => listarTarifasTarifario("vigentes", hoy) });
  const esFob = (s.incoterm ?? "").toUpperCase() === "FOB";
  const fob = useQuery({ queryKey: costeoQueryKeys.tarifario.cargos("fob"), queryFn: () => listarCargos("fob"), enabled: esFob });
  const locales = useQuery({ queryKey: costeoQueryKeys.tarifario.cargos("locales"), queryFn: () => listarCargos("locales") });
  const [busy, setBusy] = useState<string | null>(null);
  const elegida = s.tarifa_tarifario_id;
  const opciones = elegida
    ? (tarifas.data ?? []).filter((t) => t.id === elegida)
    : tarifasCoincidentes(s, tarifas.data ?? [], hoy);

  const elegir = async (id: string): Promise<boolean> => {
    setBusy(id);
    try {
      const tarifa = tarifas.data?.find((t) => t.id === id);
      if (!tarifa || tarifasCoincidentes(s, [tarifa], hoy).length === 0) {
        throw new Error("LC_PRICING_TARIFA_INCOMPATIBLE");
      }
      await aplicarTarifaTarifario(s.id, id);
      notifySuccess(undefined, { title: "Opción guardada en la solicitud" });
      await qc.invalidateQueries();
      return true;
    } catch (error) {
      notifyError(undefined, {
        title: "No se pudo guardar la opción. Verifica el tipo de contenedor y la vigencia de la tarifa.",
        error, method: "CRM_APLICAR_TARIFA_TARIFARIO",
      });
      return false;
    } finally { setBusy(null); }
  };

  return { opciones, elegida, esFob, cargosFob: fob.data ?? [], cargosLocales: locales.data ?? [],
    isLoading: tarifas.isLoading, isError: tarifas.isError,
    isFetching: tarifas.isFetching, reintentar: tarifas.refetch, busy, elegir };
}

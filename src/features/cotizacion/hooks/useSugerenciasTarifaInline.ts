/**
 * Hook de estado para `SugerenciasTarifaInline`: resuelve IDs de catálogo,
 * consulta el Top 3 de tarifas y expone el handler de selección.
 * Extraído para mantener la complejidad del componente bajo control.
 */
import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";
import { usePuertos, useTiposContenedor } from "@/features/catalogos/hooks";
import { useTopTarifas } from "@/features/costeo/hooks/useTopTarifas";
import { logTarifaSugeridaAplicada } from "@/features/cotizacion/services/bitacoraTarifa";
import { resolverPuertoId, resolverTipoId } from "@/features/cotizacion/components/seccionRuta/resolverCatalogos";
import type { CotizacionFormValues } from "@/features/cotizacion/types";
import type { TopTarifaRow } from "@/features/costeo/types";
import { fechaVigenciaCarga } from "@/lib/date/fechaVigenciaCarga";
import { useSolicitudPricing } from "@/features/crm/hooks/usePricingCrm";

interface UseSugerenciasTarifaInlineParams {
  cotizacionId?: string | null;
  onElegirTarifa: (tarifa: TopTarifaRow) => void;
}

export function useSugerenciasTarifaInline({ cotizacionId, onElegirTarifa }: UseSugerenciasTarifaInlineParams) {
  const { watch } = useFormContext<CotizacionFormValues>();
  const { data: puertos = [] } = usePuertos();
  const { data: tipos = [] } = useTiposContenedor();
  const [openDialog, setOpenDialog] = useState(false);

  const origen = watch("origen");
  const destino = watch("destino");
  const puertoOrigenIdForm = watch("puertoOrigenId");
  const puertoDestinoIdForm = watch("puertoDestinoId");
  const tipoContenedor = watch("tipoContenedor");
  const solicitudId = watch("pricingSolicitudId");
  const solicitud = useSolicitudPricing(solicitudId ?? null);
  const esperandoSolicitud = Boolean(solicitudId) && !solicitud.isSuccess;
  const fecha = fechaVigenciaCarga(solicitud.data?.fecha_tentativa_carga);

  // Etapa 3: el ID capturado en el formulario manda. `resolverPuertoId` queda
  // sólo como compatibilidad con cotizaciones legacy que únicamente tienen texto.
  const puertoOrigenId = useMemo(
    () => puertoOrigenIdForm ?? resolverPuertoId(origen, puertos),
    [puertoOrigenIdForm, origen, puertos],
  );
  const puertoDestinoId = useMemo(
    () => puertoDestinoIdForm ?? resolverPuertoId(destino, puertos),
    [puertoDestinoIdForm, destino, puertos],
  );
  const tipoContenedorId = useMemo(() => resolverTipoId(tipoContenedor, tipos), [tipoContenedor, tipos]);


  const { data: tarifas = [], isFetching, error, refetch, isRefetching } = useTopTarifas({
    puertoOrigenId: esperandoSolicitud ? "" : puertoOrigenId,
    puertoDestinoId,
    tipoContenedorId,
    fecha,
  });

  const handleElegir = (row: TopTarifaRow) => {
    const rank = (tarifas.findIndex((t) => t.id === row.id) + 1) as 1 | 2 | 3;
    onElegirTarifa(row);
    void logTarifaSugeridaAplicada({ tarifaId: row.id, ranking: rank, cotizacionId });
  };

  return {
    openDialog: esperandoSolicitud ? false : openDialog,
    setOpenDialog,
    puertoOrigenId,
    puertoDestinoId,
    tipoContenedorId,
    fecha,
    tarifas,
    isFetching: (Boolean(solicitudId) && solicitud.isPending) || isFetching,
    error: solicitudId && solicitud.isError ? solicitud.error : error,
    refetch: solicitudId && solicitud.isError ? solicitud.refetch : refetch,
    isRefetching,
    handleElegir,
  };
}

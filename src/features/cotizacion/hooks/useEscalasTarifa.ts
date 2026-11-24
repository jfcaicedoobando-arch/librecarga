import { useEffect, useState } from "react";
import { fetchEscalasTarifa } from "@/features/cotizacion/services/escalasTarifa";

/**
 * Escalas de la tarifa aérea ligada (sólo consulta en modo Aéreo).
 * Lectura simple con estado local: no exige QueryClient en resumen ni detalle.
 */
export function useEscalasTarifa(tarifaId: string | null | undefined, esAereo: boolean) {
  const [escalas, setEscalas] = useState<{ id: string; valor: string[] | null | undefined } | null>(null);
  useEffect(() => {
    if (!esAereo || !tarifaId) return undefined;
    let vigente = true;
    fetchEscalasTarifa(tarifaId)
      .then((valor) => { if (vigente) setEscalas({ id: tarifaId, valor }); })
      .catch(() => { if (vigente) setEscalas({ id: tarifaId, valor: undefined }); });
    return () => { vigente = false; };
  }, [tarifaId, esAereo]);
  return esAereo && escalas && escalas.id === tarifaId ? escalas.valor : undefined;
}

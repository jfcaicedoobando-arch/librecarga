import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import type { ConceptoVentaCotizacion } from "../../types";
import { cotizaciones } from "../../queryKeys";
import { evaluarFiscalCotizacion } from "../../services/evaluarFiscalCotizacion";
import type { usePricingScope } from "./usePricingScope";

export function useVistaFiscalCotizacion({
  scope, organizationId, clienteId, cotizacionId, conceptos,
}: {
  scope: ReturnType<typeof usePricingScope>;
  organizationId: string;
  clienteId: string | null;
  cotizacionId: string | null;
  conceptos: readonly ConceptoVentaCotizacion[];
}) {
  const conceptosFiscales = conceptos.filter((c) => c.descripcion?.trim()).map((c) => ({
    cantidad: c.cantidad,
    precio_unitario: c.precio_unitario,
    moneda: c.moneda,
    tipo_iva: c.tipo_iva,
    tasa_iva_aplicada: c.tasa_iva_aplicada,
    aplica_iva: c.aplica_iva,
    tasa_ret_iva: c.tasa_ret_iva,
  }));
  const firma = JSON.stringify(conceptosFiscales);
  const firmaEstable = useDebouncedValue(firma);
  const coinciden = firma === firmaEstable;
  const consulta = useQuery({
    queryKey: cotizaciones.vistaFiscal(scope, clienteId, cotizacionId, firma),
    queryFn: ({ signal }) => evaluarFiscalCotizacion({
      organizationId, clienteId, cotizacionId, conceptos: conceptosFiscales, signal, scope,
    }),
    enabled: coinciden && Boolean(cotizacionId || clienteId),
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
  });
  if (consulta.isError && coinciden && !consulta.isFetching) {
    return { estado: "error", reintentar: () => { void consulta.refetch(); } } as const;
  }
  if (!cotizacionId && !clienteId) return { estado: "legacy" } as const;
  if (!coinciden || consulta.isFetching || consulta.isPlaceholderData || consulta.data == null) {
    return { estado: "cargando" } as const;
  }
  return consulta.data;
}

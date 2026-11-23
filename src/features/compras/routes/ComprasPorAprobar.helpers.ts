/**
 * Helpers puros para /compras/por-aprobar. Extraído de `ComprasPorAprobar.kpi.tsx`
 * para cumplir react-refresh/only-export-components (un archivo = solo componentes).
 */
import type { FacturaCxP } from "@/features/cxp/services";
import type { useFacturasCxP } from "@/features/cxp/hooks";

export type ConsultaAprobacion = ReturnType<typeof useFacturasCxP>;

export function textoConteoAprobacion(consulta: ConsultaAprobacion) {
  if (consulta.isError) return "Sin confirmar";
  if (consulta.isLoading) return "Cargando…";
  return String(consulta.data?.length ?? 0);
}

export function sumarFacturasPorMoneda(rows: readonly FacturaCxP[]) {
  const totales = { MXN: 0, USD: 0, EUR: 0 };
  for (const factura of rows) {
    totales[factura.moneda] += Number(factura.total ?? 0);
  }
  return totales;
}

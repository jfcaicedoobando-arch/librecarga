/**
 * KPIs del AgingDrillDownDialog extraídos para respetar el
 * límite de 200 líneas del contenedor principal.
 */
import { formatCurrency } from "@/lib/formatters";
import type { CxpAgingRow } from "@/features/cxp/services/cxpAging";
import { Kpi } from "./DialogDetallePagosProveedor.parts";

export function AgingKpiRow({ proveedor }: { proveedor: CxpAgingRow }) {
  const criticas = proveedor.mas_90;
  const porVencer = proveedor.vigente;
  const vencido = proveedor.d_1_30 + proveedor.d_31_60 + proveedor.d_61_90;
  const m = proveedor.moneda;
  return (
    <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 border-b bg-background">
      <Kpi label={`Saldo total (${m})`} value={formatCurrency(proveedor.saldo_total, m)} />
      <Kpi label="Por vencer" value={formatCurrency(porVencer, m)} />
      <Kpi
        label="Vencido 1-90 d"
        value={formatCurrency(vencido, m)}
        tone={vencido > 0 ? "warn" : "default"}
      />
      <Kpi
        label="Crítico >90 d"
        value={formatCurrency(criticas, m)}
        tone={criticas > 0 ? "warn" : "default"}
        emphasis={criticas > 0}
      />
    </div>
  );
}

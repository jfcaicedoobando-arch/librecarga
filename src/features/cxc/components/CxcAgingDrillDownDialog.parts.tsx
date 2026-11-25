/**
 * Sub-piezas UI del drill-down de aging CxC (KPIs del cliente).
 * Separadas para respetar el límite de 200 líneas del diálogo.
 */
import { formatCurrency } from "@/lib/formatters";
import type { CxcAgingRow } from "@/features/cxc/services/cxcAging";
import { Kpi } from "@/features/cxp";

export function CxcAgingKpiRow({ cliente }: { cliente: CxcAgingRow }) {
  const m = cliente.moneda;
  const vencido = cliente.d_1_30 + cliente.d_31_60 + cliente.d_61_90;
  return (
    <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 border-b bg-background">
      <Kpi label={`Saldo total (${m})`} value={formatCurrency(cliente.saldo_total, m)} />
      <Kpi label="Vigente" value={formatCurrency(cliente.vigente, m)} />
      <Kpi
        label="Vencido 1-90 d"
        value={formatCurrency(vencido, m)}
        tone={vencido > 0 ? "warn" : "default"}
      />
      <Kpi
        label="Crítico +90 d"
        value={formatCurrency(cliente.mas_90, m)}
        tone={cliente.mas_90 > 0 ? "warn" : "default"}
        emphasis={cliente.mas_90 > 0}
      />
    </div>
  );
}

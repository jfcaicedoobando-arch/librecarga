import { MoneyCell } from "@/components/shared/MoneyCell";
import { Card, CardContent } from "@/components/ui/card";
import { ToneBadge } from "@/components/shared/ToneBadge";
import type { FacturaCxP } from "@/features/cxp/services";
import { bucketDeDias, BUCKET_LABELS, BUCKET_TONE } from "./agingBuckets";
/**
 * KPIs del AgingDrillDownDialog extraídos para respetar el
 * límite de 200 líneas del contenedor principal.
 */
import { formatCurrency, formatDate } from "@/lib/formatters";
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

export function FacturaAgingCard({ factura }: { factura: FacturaCxP }) {
  const bucket = bucketDeDias(factura.dias_vencido);

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="break-all font-mono text-body-sm">{factura.folio_proveedor}</p>
          <ToneBadge tone={BUCKET_TONE[bucket]}>{BUCKET_LABELS[bucket]}</ToneBadge>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-body-sm">
          <div><dt>Emisión</dt><dd>{formatDate(factura.fecha_emision)}</dd></div>
          <div><dt>Vencimiento</dt><dd>{factura.fecha_vencimiento ? formatDate(factura.fecha_vencimiento) : "—"}</dd></div>
          <div><dt>Días</dt><dd>{factura.dias_vencido > 0 ? "+" : ""}{factura.dias_vencido}</dd></div>
        </dl>
        <MoneyCell label="Saldo" value={formatCurrency(factura.saldo, factura.moneda)} highlight />
      </CardContent>
    </Card>
  );
}

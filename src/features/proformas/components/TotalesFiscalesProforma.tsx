import type { BloqueFiscalCotizacion } from "@/features/cotizacion/domain/snapshotFiscalCotizacion";
import { formatCurrency } from "@/lib/formatters";

export function TotalesFiscalesProforma({ bloques }: { bloques: BloqueFiscalCotizacion[] }) {
  return <div className="flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:justify-end">
    {bloques.map(({ moneda, subtotal, iva, ret_isr, ret_iva, total }) => (
      <div key={moneda} className="min-w-48 space-y-1 text-body">
        <p className="text-body-sm font-medium text-muted-foreground">{moneda}</p>
        <dl className="space-y-1">
          <Importe label="Subtotal" monto={formatCurrency(subtotal, moneda)} />
          <Importe label="IVA" monto={formatCurrency(iva, moneda)} />
          {ret_isr > 0 && <Importe label="ISR retenido" monto={`−${formatCurrency(ret_isr, moneda)}`} />}
          {ret_iva > 0 && <Importe label="IVA retenido" monto={`−${formatCurrency(ret_iva, moneda)}`} />}
          <div className="flex justify-between gap-6 border-t pt-1 font-bold">
            <dt>Total neto</dt><dd className="tabular-nums">{formatCurrency(total, moneda)}</dd>
          </div>
        </dl>
      </div>
    ))}
  </div>;
}

function Importe({ label, monto }: { label: string; monto: string }) {
  return <div className="flex justify-between gap-6">
    <dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{monto}</dd>
  </div>;
}

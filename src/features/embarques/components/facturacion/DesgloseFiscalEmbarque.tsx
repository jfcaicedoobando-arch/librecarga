import { formatCurrency } from "@/lib/formatters";
import type { SnapshotFiscalCotizacion } from "@/features/cotizacion/domain/snapshotFiscalCotizacion";

/** Render server totals without recalculating tax or converting currencies. */
export function DesgloseFiscalEmbarque({ fiscal, preview = false }: { fiscal: SnapshotFiscalCotizacion; preview?: boolean }) {
  return <section aria-label="Desglose fiscal del embarque" className="rounded-md border p-4 space-y-3">
    <p className="font-semibold">{preview ? "Vista previa fiscal" : "Desglose fiscal guardado"}</p>
    {fiscal.estado === "pendiente" && <p role="status" className="text-body-sm text-warning">Total provisional. Revisa el perfil del emisor y los datos fiscales del cliente antes de proformar.</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      {fiscal.bloques.map((bloque) => <div key={bloque.moneda}>
        <p className="font-semibold">{bloque.moneda}</p>
        <dl className="text-body-sm space-y-1">
          {([
            ["Subtotal", bloque.subtotal], ["IVA", bloque.iva],
            ["ISR retenido", bloque.ret_isr], ["IVA retenido", bloque.ret_iva],
            [fiscal.estado === "pendiente" ? "Total neto provisional" : "Total neto", bloque.total],
          ] as const).map(([label, amount]) => <div className="flex justify-between gap-4" key={label}>
            <dt>{label}</dt><dd className="tabular-nums">{formatCurrency(amount, bloque.moneda)}</dd>
          </div>)}
        </dl>
      </div>)}
    </div>
    <p className="text-body-sm text-muted-foreground">Las retenciones no reducen la venta base usada para calcular el margen.</p>
  </section>;
}

/** Tarjeta «Costo cotizado vs real» por moneda (sólo lectura). */
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/formatters/numbers";
import { useCostoVsReal } from "@/features/crm/hooks/useRecotizarPricing";
import { ETIQUETA_ESTADO_COSTO, type ResumenCostoReal } from "@/features/crm/services/pricing/costoVsRealPricing";

export function TablaCostoReal({ resumen }: { resumen: ResumenCostoReal }) {
  if (resumen.estado !== "con_resultado" && resumen.estado !== "esperando_facturas") return null;
  return (
    <table className="w-full text-body-sm">
      <thead><tr className="text-left text-muted-foreground">
        <th className="py-1">Moneda</th><th className="text-right">Cotizado</th><th className="text-right">Real</th>
        <th className="text-right">Diferencia</th><th className="text-right">%</th>
      </tr></thead>
      <tbody>{resumen.monedas.map((m) => (
        <tr key={m.moneda} className="border-t">
          <td className="py-1">{m.moneda}</td>
          <td className="text-right">{formatCurrency(m.cotizado, m.moneda)}</td>
          <td className="text-right">{formatCurrency(m.real, m.moneda)}</td>
          <td className={m.diferencia > 0 ? "text-right text-destructive" : "text-right"}>{formatCurrency(m.diferencia, m.moneda)}</td>
          <td className="text-right">{m.pct == null ? "—" : `${m.pct.toFixed(1)} %`}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

export function CostoVsRealPricing({ solicitudId }: { solicitudId: string }) {
  const consulta = useCostoVsReal([solicitudId]);
  const resumen = consulta.data?.get(solicitudId);
  if (consulta.isLoading || !resumen || resumen.estado === "sin_cotizacion") return null;
  return (
    <section aria-label="Costo cotizado vs real" className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-subsection">Costo cotizado vs real</h3>
        <Badge variant="outline">{ETIQUETA_ESTADO_COSTO[resumen.estado]}</Badge>
        {resumen.cotizacionFolio && <span className="text-caption text-muted-foreground">
          {[resumen.cotizacionFolio, resumen.expediente].filter(Boolean).join(" · ")}</span>}
      </div>
      <TablaCostoReal resumen={resumen} />
      <p className="text-caption text-muted-foreground">Real = facturas de proveedor vigentes del embarque, antes de IVA. Cada moneda se compara por separado.</p>
    </section>
  );
}

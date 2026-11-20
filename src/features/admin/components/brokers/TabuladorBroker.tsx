/** Tabulador oficial de comisiones de brokers (sólo lectura). */
import { formatCurrency } from "@/lib/formatters/numbers";
import { RETENCION_USD_POR_OPERACION, TABULADOR_BROKER } from "@/features/portal-broker/domain/tabuladorBroker";

export function TabuladorBroker() {
  return (
    <div className="space-y-2">
      <p className="text-body-sm text-muted-foreground">
        Por servicio: ganancia en USD menos {formatCurrency(RETENCION_USD_POR_OPERACION, "USD")} por operación,
        por el % indicado. Si resulta menor, se paga el mínimo por unidad (aunque la base sea cero).
      </p>
      <table className="w-full text-body-sm">
        <thead className="text-muted-foreground">
          <tr><th className="text-left font-medium">Servicio</th><th className="text-left font-medium">Unidad</th>
            <th className="text-right font-medium">%</th><th className="text-right font-medium">Mínimo</th></tr>
        </thead>
        <tbody>
          {TABULADOR_BROKER.map((t) => (
            <tr key={t.servicio} className="border-t">
              <td className="py-1">{t.nombre}</td><td>{t.unidad}</td>
              <td className="text-right tabular-nums">{t.pct}%</td>
              <td className="text-right tabular-nums">{t.minimo == null ? "Sin mínimo" : formatCurrency(t.minimo, "USD")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

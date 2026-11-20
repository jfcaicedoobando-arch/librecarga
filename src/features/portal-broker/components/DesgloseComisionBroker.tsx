/** Desglose por servicio de una comisión de broker (USD). */
import { formatCurrency } from "@/lib/formatters/numbers";
import { nombreServicio, serviciosDesglose } from "../domain/tabuladorBroker";

const usd = (n: number) => formatCurrency(Number(n), "USD");

export function DesgloseComisionBroker({ desglose }: { desglose: unknown }) {
  const servicios = serviciosDesglose(desglose);
  if (servicios.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="space-y-0.5 text-body-sm">
      {servicios.map((s) => (
        <li key={s.servicio}>
          <span className="font-medium">{nombreServicio(s.servicio)}</span>
          <span className="block text-muted-foreground">
            Ganancia {usd(s.ganancia_usd)} − retención {usd(s.retencion_usd)} = base {usd(s.base_usd)} × {Number(s.pct)}%
            {s.minimo_aplicado ? ` · mínimo ${usd(s.minimo_usd)}` : ""} → {usd(s.comision_usd)}
          </span>
        </li>
      ))}
    </ul>
  );
}

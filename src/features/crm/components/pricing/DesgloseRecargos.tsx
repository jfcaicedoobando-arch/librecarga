/**
 * Desglose de recargos de una opción de Pricing, separado en origen y destino.
 */
import { formatCurrency } from "@/lib/formatters/numbers";
import type { TarifaRespuestaRow } from "@/features/crm/services/pricing/tarifasRespuesta";

type Recargo = NonNullable<TarifaRespuestaRow["recargos"]>[number];

function Lado({ titulo, filas }: { titulo: string; filas: Recargo[] }) {
  if (filas.length === 0) return null;
  return (
    <div>
      <p className="font-medium">{titulo}</p>
      <ul className="space-y-0.5">
        {filas.map((r) => (
          <li key={r.id} className="flex justify-between gap-2">
            <span>{r.concepto} <span className="text-muted-foreground">· {r.base === "por_embarque" ? "por embarque" : "por unidad"}</span></span>
            <span className="tabular-nums">{formatCurrency(Number(r.monto) || 0, r.moneda || "USD")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DesgloseRecargos({ recargos }: { recargos?: Recargo[] }) {
  const lista = recargos ?? [];
  return (
    <div className="col-span-2 grid gap-3 rounded-md border p-3 md:col-span-4 md:grid-cols-2">
      {lista.length === 0
        ? <p className="text-muted-foreground md:col-span-2">Sin recargos: sólo flete.</p>
        : <>
            <Lado titulo="Recargos en origen" filas={lista.filter((r) => r.lado !== "destino")} />
            <Lado titulo="Recargos en destino" filas={lista.filter((r) => r.lado === "destino")} />
          </>}
    </div>
  );
}

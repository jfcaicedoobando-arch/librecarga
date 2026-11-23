/**
 * Totales del periodo por moneda, calculados en el servidor (FIX C3c).
 * Se muestran sin convertir para no mezclar divisas con tipos de cambio dudosos.
 */
import { Card } from "@/components/ui/card";
import { Wallet } from "lucide-react";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { KpiGridSkeleton } from "@/components/shared/skeletons";
import { formatCurrency } from "@/lib/formatters/numbers";
import { formatDate } from "@/lib/formatters/dates";
import type { DireccionTotales } from "@/features/dashboard/direccion/services/loaders";

const BLOQUES: Array<{ key: keyof Pick<DireccionTotales, "ventas" | "costos" | "facturado" | "cobrado">; label: string }> = [
  { key: "ventas", label: "Ventas" },
  { key: "costos", label: "Costos" },
  { key: "facturado", label: "Facturado" },
  { key: "cobrado", label: "Cobrado" },
];

function MonedasList({ montos }: { montos: Record<string, number> }) {
  const entradas = Object.entries(montos ?? {}).filter(([, v]) => Number(v) !== 0);
  if (entradas.length === 0) {
    return <EmptyStateInline icon={Wallet} message="Sin movimientos" className="py-2" />;
  }
  return (
    <ul className="mt-1 space-y-0.5">
      {entradas.map(([moneda, monto]) => (
        <li key={moneda} className="text-body tabular-nums">
          {/* VB-04: formatCurrency ya incluye el código ISO; no repetirlo como sufijo. */}
          {formatCurrency(Number(monto), moneda)}

        </li>
      ))}
    </ul>
  );
}

interface Props {
  totales?: DireccionTotales;
  desdeIso: string;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
}

export function TotalesPeriodoCard({ totales, desdeIso, isLoading, isError, isFetching, onRetry }: Props) {
  return (
    <Card className="p-5 rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body-sm text-muted-foreground">
          Totales del periodo por moneda
        </p>
        <p className="text-body-sm text-muted-foreground">
          Desde {formatDate(desdeIso)}{totales && !isError && ` · ${totales.embarques} embarques`}
        </p>
      </div>
      {isError ? (
        <ErrorStateInline className="mt-3" title="No se pudieron consultar los totales del periodo"
          message="Reintenta para consultar los importes por moneda." onRetry={onRetry} retrying={isFetching} />
      ) : isLoading ? (
        <KpiGridSkeleton count={BLOQUES.length} heightClass="h-14" className="mt-3" />
      ) : totales ? (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4">
          {BLOQUES.map((b) => (
            <div key={b.key}>
              <p className="text-body-sm font-medium text-muted-foreground">{b.label}</p>
              <MonedasList montos={totales[b.key]} />
            </div>
          ))}
        </div>
      ) : <EmptyStateInline message="Sin totales disponibles para el periodo." />}
    </Card>
  );
}

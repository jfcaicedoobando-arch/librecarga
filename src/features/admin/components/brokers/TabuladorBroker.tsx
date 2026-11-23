/** Tabulador oficial de comisiones de brokers (sólo lectura). */
import { DataTable, defineColumns } from "@/components/shared/DataTable";
import { formatCurrency } from "@/lib/formatters/numbers";
import { RETENCION_USD_POR_OPERACION, TABULADOR_BROKER } from "@/features/portal-broker/domain/tabuladorBroker";

type ReglaComision = (typeof TABULADOR_BROKER)[number];
const reglas = [...TABULADOR_BROKER];
const columns = defineColumns<ReglaComision>([
  { accessorKey: "nombre", header: "Servicio" },
  { accessorKey: "unidad", header: "Unidad" },
  { id: "pct", header: "%", meta: { align: "right" }, accessorFn: (regla) => `${regla.pct}%` },
  {
    id: "minimo",
    header: "Mínimo",
    meta: { align: "right" },
    accessorFn: (regla) => regla.minimo == null ? "Sin mínimo" : formatCurrency(regla.minimo, "USD"),
  },
]);

export function TabuladorBroker() {
  return (
    <div className="space-y-2">
      <p className="text-body-sm text-muted-foreground">
        Por servicio: ganancia en USD menos {formatCurrency(RETENCION_USD_POR_OPERACION, "USD")} por operación,
        por el % indicado. Si resulta menor, se paga el mínimo por unidad (aunque la base sea cero).
      </p>
      <DataTable columns={columns} data={reglas} rowKey={(regla) => regla.servicio} density="compact" />
    </div>
  );
}

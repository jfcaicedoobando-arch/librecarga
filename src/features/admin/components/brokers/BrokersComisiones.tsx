/** Comisiones de brokers: devengado por broker, liquidación mensual y pago. */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataTable, defineColumns } from "@/components/shared/DataTable";
import { moneyColumn } from "@/components/shared/dataTable/columnBuilders";
import { ReasonDialog } from "@/components/shared/ReasonDialog";
import { formatCurrency } from "@/lib/formatters/numbers";
import { hoyMx, ymMx } from "@/lib/date/mx";
import type { ResumenComisionBroker } from "@/features/admin/services/brokers";
import {
  useLiquidacionesBroker, useLiquidarBroker, usePagarLiquidacionBroker, useResumenComisionesBroker,
} from "@/features/admin/hooks/useBrokerComisiones";

const mxn = (n: number) => formatCurrency(Number(n), "MXN");

export function BrokersComisiones() {
  const [periodo, setPeriodo] = useState(ymMx);
  const [pagar, setPagar] = useState<string | null>(null);
  const resumen = useResumenComisionesBroker();
  const liqs = useLiquidacionesBroker();
  const liquidar = useLiquidarBroker();
  const pago = usePagarLiquidacionBroker();
  const nombre = (id: string) => resumen.data?.find((r) => r.broker_id === id)?.broker ?? "";
  const columns = defineColumns<ResumenComisionBroker>([
    { id: "broker", accessorKey: "broker", header: "Broker" },
    moneyColumn({ id: "devengado", header: "Devengado", accessor: (r) => Number(r.devengado_mxn) }),
    moneyColumn({ id: "liquidado", header: "Liquidado por pagar", accessor: (r) => Number(r.liquidado_pendiente_mxn) }),
    moneyColumn({ id: "pagado", header: "Pagado", accessor: (r) => Number(r.pagado_mxn) }),
    { id: "acciones", header: "Acciones", enableSorting: false, meta: { align: "right" },
      cell: ({ row: { original: r } }) => (
        <Button size="sm" variant="outline" disabled={Number(r.devengado_mxn) <= 0 || liquidar.isPending}
          onClick={() => liquidar.mutate({ brokerId: r.broker_id, periodo })}>Liquidar mes</Button>
      ) },
  ]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-h4">Comisiones de brokers</h3>
        <label htmlFor="broker-periodo" className="flex items-center gap-2 text-body-sm">
          Mes a liquidar
          <Input id="broker-periodo" type="month" className="w-40" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
        </label>
      </div>
      <DataTable columns={columns} data={resumen.data ?? []} rowKey={(r) => r.broker_id}
        isLoading={resumen.isLoading} isError={resumen.isError} onRetry={resumen.refetch}
        emptyMessage="Aún no hay comisiones de brokers." />
      {(liqs.data ?? []).map((l) => (
        <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-body-sm">
          <span>{nombre(l.broker_id)} · {l.periodo} · {mxn(l.total_mxn)}</span>
          <Button size="sm" onClick={() => setPagar(l.id)}>Marcar pagada</Button>
        </div>
      ))}
      <ReasonDialog open={!!pagar} onOpenChange={(o) => { if (!o) setPagar(null); }}
        title="Registrar pago de liquidación" description="Se registra con fecha de hoy."
        label="Referencia del pago" placeholder="SPEI / transferencia" confirmLabel="Marcar pagada" minLength={3}
        pending={pago.isPending}
        onConfirm={async (ref) => {
          if (!pagar) return;
          await pago.mutateAsync({ id: pagar, fecha: hoyMx(), referencia: ref });
          setPagar(null);
        }} />
    </section>
  );
}

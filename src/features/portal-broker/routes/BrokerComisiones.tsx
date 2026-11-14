/** Portal de Brokers · Comisiones: totales y estatus de cada comisión (sólo lectura). */
import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { CargaGuard } from "@/components/shared/states/CargaGuard";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, defineColumns } from "@/components/shared/DataTable";
import { dateColumn, moneyColumn } from "@/components/shared/dataTable/columnBuilders";
import { useDocumentTitle } from "@/hooks/shared";
import { formatCurrency } from "@/lib/formatters/numbers";
import type { ComisionBrokerFila } from "../services/brokerPortal";
import { estatusVisible, totalesComisiones } from "../domain/totalesComisiones";
import { useMisComisionesBroker } from "../hooks/useBrokerPortal";

const columns = defineColumns<ComisionBrokerFila>([
  dateColumn({ accessor: (f) => f.fecha }),
  { id: "cliente", header: "Cliente", cell: ({ row: { original: f } }) => (
    <>{f.empresa}<span className="block text-body-sm text-muted-foreground">{f.organizacion}</span></>
  ) },
  { id: "factura", header: "Factura", cell: ({ row }) => row.original.factura || "—" },
  { id: "porcentaje", header: "%", meta: { align: "right" }, cell: ({ row }) => `${Number(row.original.porcentaje)}%` },
  moneyColumn({ header: "Comisión", accessor: (f) => Number(f.comision_mxn) }),
  { id: "estado", header: "Estatus", cell: ({ row }) => <Badge variant="outline">{estatusVisible(row.original)}</Badge> },
]);

function Total({ label, monto }: { label: string; monto: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-body-sm text-muted-foreground">{label}</p>
        <p className="text-h4 tabular-nums">{formatCurrency(monto, "MXN")}</p>
      </CardContent>
    </Card>
  );
}

export default function BrokerComisiones() {
  useDocumentTitle("Mis comisiones");
  const q = useMisComisionesBroker();
  const filas = q.data ?? [];
  const t = totalesComisiones(filas);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Wallet className="h-6 w-6 text-primary" />}
        title="Mis comisiones"
        description="Se ganan cuando el cliente paga, sobre la utilidad real del embarque."
      />
      <CargaGuard isLoading={q.isLoading} isError={q.isError} onRetry={q.refetch}
        errorTitle="No se pudieron cargar tus comisiones" errorDescription="Revisa tu conexión y vuelve a intentar.">
        <div className="grid gap-3 sm:grid-cols-3">
          <Total label="Pendiente (devengada)" monto={t.pendiente} />
          <Total label="Liquidada por pagar" monto={t.liquidado} />
          <Total label="Pagada" monto={t.pagado} />
        </div>
        <DataTable columns={columns} data={filas} rowKey={(f) => f.id}
          emptyMessage="Aún no tienes comisiones." />
      </CargaGuard>
    </div>
  );
}

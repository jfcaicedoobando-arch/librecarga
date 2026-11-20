import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CargaGuard } from "@/components/shared/states/CargaGuard";
import { DataTable, defineColumns } from "@/components/shared/DataTable";
import { formatNumber } from "@/lib/formatters/numbers";
import { useBrokers } from "@/features/admin/hooks/useBrokers";
import NuevoBrokerDialog from "./NuevoBrokerDialog";
import PorcentajesBrokerDialog from "./PorcentajesBrokerDialog";
import { BrokersComisiones } from "./BrokersComisiones";
import type { BrokerFila } from "@/features/admin/services/brokers";

export function BrokersTab() {
  const [open, setOpen] = useState(false);
  const [editar, setEditar] = useState<BrokerFila | null>(null);
  const q = useBrokers();
  const brokers = q.data ?? [];
  const columns = defineColumns<BrokerFila>([
    { id: "nombre", accessorKey: "nombre", header: "Nombre" },
    { id: "email", accessorKey: "email", header: "Correo" },
    { id: "comision", header: "Broker", cell: () => "Tabulador" },
    { id: "kam", header: "% KAM", meta: { align: "right" },
      cell: ({ row }) => row.original.comision_kam_pct == null
        ? "Normal" : `${formatNumber(Number(row.original.comision_kam_pct), { maximumFractionDigits: 2 })}%` },
    { id: "estado", header: "Estado", cell: ({ row }) => (
      <Badge variant={row.original.activo ? "secondary" : "outline"}>{row.original.activo ? "Activo" : "Inactivo"}</Badge>
    ) },
    { id: "acciones", header: "Acciones", enableSorting: false, meta: { align: "right" },
      cell: ({ row }) => <Button size="sm" variant="ghost" onClick={() => setEditar(row.original)}>Porcentajes</Button> },
  ]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="size-4" />
          Crear broker nuevo
        </Button>
      </div>
      <NuevoBrokerDialog open={open} onOpenChange={setOpen} />
      <CargaGuard
        isLoading={q.isLoading}
        isError={q.isError}
        onRetry={q.refetch}
        errorTitle="No se pudo cargar el listado de brokers"
        errorDescription="Revisa tu conexión y vuelve a intentar."
      >
        <DataTable columns={columns} data={brokers} rowKey={(b) => b.id}
          emptyMessage="Todavía no hay brokers dados de alta." />
      </CargaGuard>
      {editar && <PorcentajesBrokerDialog broker={editar} onClose={() => setEditar(null)} />}
      <BrokersComisiones />
    </div>
  );
}

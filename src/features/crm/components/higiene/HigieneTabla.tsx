import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { defineColumns } from "@/components/shared/DataTable";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { MobileRowDetails } from "@/components/shared/dataTable/MobileRowDetails";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { formatCurrency } from "@/lib/formatters/numbers";
import { formatFechaEs } from "@/lib/formatters/dates";
import { ETIQUETA_HIGIENE, VARIANTE_HIGIENE, ordenarPorUrgencia } from "@/features/crm/domain/higieneMetas";
import type { HigieneOportunidad } from "@/features/crm/services/higiene";

function Oportunidad({ fila }: { fila: HigieneOportunidad }) {
  return (
    <>
      <span className="font-medium">{fila.nombre}</span>
      {fila.cliente_nombre && (
        <span className="block text-body-sm text-muted-foreground">{fila.cliente_nombre}</span>
      )}
      {!fila.registro_completo && <Badge variant="outline" className="mt-1">Datos incompletos</Badge>}
    </>
  );
}

function ProximaActividad({ fila }: { fila: HigieneOportunidad }) {
  return (
    <>
      {fila.proxima_actividad_at ? formatFechaEs(fila.proxima_actividad_at) : "Sin programar"}
      {fila.actividad_vencida && <Badge variant="destructive" className="ml-2">Vencida</Badge>}
    </>
  );
}

function EstadoHigiene({ fila }: { fila: HigieneOportunidad }) {
  return (
    <Badge variant={VARIANTE_HIGIENE[fila.estado_higiene]}>
      {ETIQUETA_HIGIENE[fila.estado_higiene]}
    </Badge>
  );
}

const monto = (fila: HigieneOportunidad) => formatCurrency(fila.monto_estimado ?? 0, fila.moneda ?? "MXN");
const vendedor = (fila: HigieneOportunidad) => fila.vendedor_email ?? "Sin asignar";

const columns = defineColumns<HigieneOportunidad>([
  { id: "oportunidad", header: "Oportunidad", cell: ({ row }) => <Oportunidad fila={row.original} /> },
  { id: "etapa", header: "Etapa", cell: ({ row }) => row.original.etapa_nombre },
  { id: "vendedor", header: "Vendedor", cell: ({ row }) => vendedor(row.original) },
  { id: "monto", header: "Monto", meta: { align: "right" }, cell: ({ row }) => monto(row.original) },
  { id: "dias", header: "Días sin mov.", meta: { align: "right" }, cell: ({ row }) => row.original.dias_sin_movimiento },
  { id: "sla", header: "SLA", meta: { align: "right" }, cell: ({ row }) => row.original.sla_dias },
  { id: "actividad", header: "Próxima actividad", cell: ({ row }) => <ProximaActividad fila={row.original} /> },
  { id: "estado", header: "Estado", cell: ({ row }) => <EstadoHigiene fila={row.original} /> },
]);

export default function HigieneTabla({ filas }: { filas: HigieneOportunidad[] }) {
  if (filas.length === 0) {
    return (
      <EmptyStateInline
        message="Sin oportunidades abiertas"
        hint="Cuando el equipo registre oportunidades verás aquí su higiene y SLA."
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <ResponsiveDataTable
          columns={columns}
          data={ordenarPorUrgencia(filas)}
          density={TABLE_DENSITY.embebida}
          rowKey={(fila) => fila.id}
          getRowHref={(fila) => `/crm/oportunidades/${fila.id}`}
          getRowAriaLabel={(fila) => `Ver oportunidad ${fila.nombre}`}
          mobileCard={(fila) => (
            <>
              <Oportunidad fila={fila} />
              <MobileRowDetails fields={[
                { label: "Etapa", value: fila.etapa_nombre },
                { label: "Vendedor", value: vendedor(fila) },
                { label: "Monto", value: monto(fila) },
                { label: "Días sin movimiento", value: fila.dias_sin_movimiento },
                { label: "SLA", value: fila.sla_dias },
                { label: "Próxima actividad", value: <ProximaActividad fila={fila} /> },
                { label: "Estado", value: <EstadoHigiene fila={fila} /> },
              ]} />
            </>
          )}
        />
      </CardContent>
    </Card>
  );
}

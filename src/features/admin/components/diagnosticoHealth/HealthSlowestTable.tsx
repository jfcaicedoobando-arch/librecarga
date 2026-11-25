/**
 * Tabla con top 5 funciones más lentas (p50/p95).
 * Extraído de `DiagnosticoHealthPanel`.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListSkeleton } from "@/components/shared/states/ListSkeleton";
import { formatNumber } from "@/lib/formatters";
import { Gauge } from "lucide-react";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";

import { DataTable, defineColumns } from "@/components/shared/DataTable";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
interface Row {
  fn: string;
  p50_ms: number | null;
  p95_ms: number | null;
  total: number;
}

function formatMs(v: number | null): string {
  if (v === null) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`;
}

const columns = defineColumns<Row>([
  { accessorKey: "fn", header: "Función", enableSorting: false, meta: { className: "font-mono" } },
  { id: "p50", header: "p50", meta: { align: "right" }, cell: ({ row }) => formatMs(row.original.p50_ms) },
  { id: "p95", header: "p95", meta: { align: "right", className: "font-medium" }, cell: ({ row }) => formatMs(row.original.p95_ms) },
  { id: "eventos", header: "Eventos", meta: { align: "right" }, cell: ({ row }) => formatNumber(row.original.total) },
]);

interface Props {
  loading: boolean;
  data: Row[];
}

export default function HealthSlowestTable({ loading, data }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-medium">Top 5 más lentas (p95)</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ListSkeleton rows={5} />
        ) : data.length === 0 ? (
          <EmptyStateInline icon={Gauge} message="Sin mediciones de latencia." className="py-10" />
        ) : (
          <DataTable columns={columns} data={data} density={TABLE_DENSITY.embebida}
            rowKey={(row) => row.fn} striped={false} hoverable={false} />
        )}
      </CardContent>
    </Card>
  );
}

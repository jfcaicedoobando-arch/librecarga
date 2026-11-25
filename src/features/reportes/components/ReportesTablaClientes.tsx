import { VACIO_RENTABILIDAD } from "@/types/rentabilidad";
import { useNavigate } from "react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { defineColumns, type ColumnDef } from "@/components/shared/DataTable";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { formatCurrency, toTitleCase } from "@/lib/formatters";
import { MargenBadge } from "@/components/shared/MargenBadge";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { Hint } from "@/components/shared/Hint";
import { MoneyCell } from "@/components/shared/MoneyCell";

import type { SortField } from "../domain/reportesFilters";

interface ClienteRow {
  cliente_id: string;
  cliente_nombre: string;
  total_embarques: number;
  venta_usd: number;
  costo_usd: number;
  profit_usd: number;
  margen: number;
}

interface Props {
  data: ClienteRow[];
  isLoading: boolean;
  sortField: SortField;
  sortDir: "asc" | "desc";
  onSort: (field: SortField) => void;
}

const margenBadge = (m: number, venta = 0) => <MargenBadge pct={m} venta={venta} />;

const SORT_LABELS: Record<SortField, string> = {
  venta_usd: "Venta equivalente (USD)",
  costo_usd: "Costo equivalente (USD)",
  profit_usd: "Utilidad equivalente (USD)",
  margen: "Margen",
};

export default function ReportesTablaClientes({ data, isLoading, sortField, sortDir, onSort }: Props) {
  const navigate = useNavigate();

  const columns: ColumnDef<ClienteRow, unknown>[] = defineColumns<ClienteRow>([
    { id: "cliente", header: "Cliente", meta: { className: "font-medium max-w-[200px] truncate" },
      cell: ({ row }) => <Hint label={toTitleCase(row.original.cliente_nombre)}><span>{toTitleCase(row.original.cliente_nombre)}</span></Hint> },
    { id: "embarques", header: "Embarques", meta: { align: "center" }, cell: ({ row }) => row.original.total_embarques },
    { id: "venta_usd", header: SORT_LABELS.venta_usd, accessorFn: (cliente) => cliente.venta_usd, enableSorting: true, meta: { align: "right", className: "tabular-nums" }, cell: ({ row }) => formatCurrency(row.original.venta_usd, "USD") },
    { id: "costo_usd", header: SORT_LABELS.costo_usd, accessorFn: (cliente) => cliente.costo_usd, enableSorting: true, meta: { align: "right", className: "tabular-nums" }, cell: ({ row }) => formatCurrency(row.original.costo_usd, "USD") },
    { id: "profit_usd", header: SORT_LABELS.profit_usd, accessorFn: (cliente) => cliente.profit_usd, enableSorting: true, meta: { align: "right", className: "tabular-nums font-semibold" }, cell: ({ row }) => formatCurrency(row.original.profit_usd, "USD") },
    { id: "margen", header: SORT_LABELS.margen, accessorFn: (cliente) => cliente.margen, enableSorting: true, meta: { align: "center" }, cell: ({ row }) => margenBadge(row.original.margen, row.original.venta_usd) },
  ]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Desglose por cliente</CardTitle>
        <div className="flex items-center gap-2 md:hidden">
          <Select value={sortField} onValueChange={(key: SortField) => onSort(key)}>
            <SelectTrigger className="w-full" aria-label="Ordenar clientes por"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(SORT_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="icon" variant="outline" className="shrink-0" onClick={() => onSort(sortField)}
            aria-label={sortDir === "asc" ? "Orden ascendente. Cambiar a descendente" : "Orden descendente. Cambiar a ascendente"}>
            {sortDir === "asc" ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[400px] overflow-auto">
          <ResponsiveDataTable
            columns={columns}
            data={data}
            isLoading={isLoading}
            rowKey={(c) => c.cliente_id}
            onRowClick={(c) => navigate(`/clientes/${c.cliente_id}`)}
            sortMode="server"
            controlledSort={{ key: sortField, dir: sortDir }}
            onSortChange={(key) => {
              if (key === null) onSort(sortField);
              else if (Object.hasOwn(SORT_LABELS, key)) onSort(key as SortField);
            }}
            emptyMessage={VACIO_RENTABILIDAD}
            density={TABLE_DENSITY.embebida}
            mobileCard={(c) => (
              <div className="flex flex-col gap-2 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{toTitleCase(c.cliente_nombre)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{c.total_embarques} embarques</div>
                  </div>
                  {margenBadge(c.margen, c.venta_usd)}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MoneyCell label="Venta eq. USD" value={formatCurrency(c.venta_usd, "USD")} />
                  <MoneyCell label="Costo eq. USD" value={formatCurrency(c.costo_usd, "USD")} />
                  <MoneyCell label="Utilidad eq. USD" value={formatCurrency(c.profit_usd, "USD")} highlight />
                </div>
              </div>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}

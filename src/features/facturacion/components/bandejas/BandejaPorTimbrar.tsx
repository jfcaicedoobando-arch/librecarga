/**
 * Bandeja "Por timbrar": borradores creados en el sistema pendientes de FacturApi.
 * Estados unificados vía `<BandejaShell />` (loading + empty + error).
 */
import { Card, CardContent } from "@/components/ui/card";
import { Stamp } from "lucide-react";
import { FilteredListEmptyState } from "@/components/empty/FilteredListEmptyState";
import { defineColumns } from "@/components/shared/DataTable";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { Hint } from "@/components/shared/Hint";
import { clientColumn, moneyColumn, dateColumn } from "@/components/shared/dataTable/columnBuilders";
import { formatCurrency, formatDate, toTitleCase } from "@/lib/formatters";
import { useClientPagedList } from "@/hooks/shared/useClientPagedList";
import { useFacturasPorTimbrar, type FilaPorTimbrar } from "@/features/facturacion/hooks/useBandejas";
import { BandejaShell } from "./BandejaShell";
import { COL_W } from "@/components/shared/dataTable/columnWidths";

function referenciaBorrador(numero: string): string {
  return numero.slice("BORRADOR-".length).slice(-8).toUpperCase();
}

function FolioInterno({ numero }: { numero: string }) {
  if (!numero.startsWith("BORRADOR-")) return numero;
  return <Hint label={numero}>
    <span className="text-muted-foreground italic">Sin folio · {referenciaBorrador(numero)}</span>
  </Hint>;
}

const columns = defineColumns<FilaPorTimbrar>([
  {
    id: "numero",
    header: "Folio interno",
    accessorFn: (r) => r.numero,
    enableSorting: true,
    meta: { width: COL_W.nombre, className: "font-mono whitespace-nowrap", sticky: true },
    cell: ({ row }) => <FolioInterno numero={row.original.numero} />,
  },
  clientColumn<FilaPorTimbrar>({ accessor: (r) => r.cliente_nombre }),
  { ...dateColumn<FilaPorTimbrar>({ id: "emision", header: "Emisión prevista", accessor: (r) => r.fecha_emision }),
    meta: { width: COL_W.fecha, className: "text-body-sm whitespace-nowrap" } },
  { ...moneyColumn<FilaPorTimbrar>({ id: "total", header: "Total",
      accessor: (r) => r.total, currencyAccessor: (r) => r.moneda }),
    meta: { width: COL_W.monto, align: "right", className: "tabular-nums whitespace-nowrap font-medium" } },
]);

export function BandejaPorTimbrar() {
  const { data, isLoading, isError, refetch } = useFacturasPorTimbrar();
  const paged = useClientPagedList<FilaPorTimbrar, Record<string, string>>({
    data,
    isLoading,
    defaultFilters: {},
    defaultSort: { key: "emision", dir: "desc" },
    searchAccessor: (r) => `${r.numero} ${r.cliente_nombre}`,
    sorters: {
      numero: (a, b) => a.numero.localeCompare(b.numero),
      cliente: (a, b) => a.cliente_nombre.localeCompare(b.cliente_nombre),
      emision: (a, b) => a.fecha_emision.localeCompare(b.fecha_emision),
      total: (a, b) => a.total - b.total,
    },
  });
  const totalCount = data?.length ?? 0;

  return (
    <BandejaShell
      isError={isError}
      onRetry={() => refetch()}
      search={paged.search}
      onSearchChange={paged.setSearch}
      searchPlaceholder="Buscar folio o cliente…"
      chips={paged.activeChips}
      activeCount={paged.activeCount}
      onClearAll={paged.resetAll}
      counter={<>Mostrando <strong className="text-foreground">{paged.filteredCount}</strong> de {totalCount} borradores</>}
    >
      <Card>
        <CardContent className="p-0">
          <ResponsiveDataTable
            columns={columns}
            data={paged.rows}
            isLoading={paged.isLoading}
            emptyState={
              <FilteredListEmptyState
                filtered={Boolean(paged.search?.trim()) || paged.activeCount > 0}
                onClearFilters={paged.resetAll}
                icon={Stamp}
                message="No hay CFDI en borrador esperando timbrado."
              />
            }
            rowKey={(r) => r.id}
            getRowHref={(r) => `/facturacion/${r.id}`}
            getRowAriaLabel={(r) => r.numero.startsWith("BORRADOR-")
              ? `Abrir borrador ${referenciaBorrador(r.numero)} de ${r.cliente_nombre}`
              : `Abrir factura ${r.numero}`}
            sortMode="server"
            controlledSort={paged.controlledSort}
            onSortChange={paged.setSort}
            pagination={paged.pagination}
            mobileCard={(r) => (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-body truncate font-mono">
                    <FolioInterno numero={r.numero} />
                  </div>
                  <div className="text-body-sm text-muted-foreground truncate mt-0.5">{toTitleCase(r.cliente_nombre)}</div>
                  <div className="text-label text-muted-foreground mt-0.5">Emisión prevista: {formatDate(r.fecha_emision)}</div>
                </div>
                <span className="text-body font-semibold tabular-nums whitespace-nowrap">{formatCurrency(r.total, r.moneda)}</span>
              </div>
            )}
          />
        </CardContent>
      </Card>
    </BandejaShell>
  );
}

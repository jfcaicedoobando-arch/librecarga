import { useMemo, useState } from "react";
import { Download, ChevronDown, Receipt } from "lucide-react";
import { DialogDescargarZipMes } from "@/features/facturacion/components/DialogDescargarZipMes";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import { FILTRO_ANCHO } from "@/lib/ui/filterWidths";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { useRowSelection } from "@/components/shared/dataTable/useRowSelection";
import { buildSelectionColumn } from "@/components/shared/dataTable/buildSelectionColumn";
import { UnifiedFiltersBar } from "@/components/shared/filters/UnifiedFiltersBar";
import { FacturasMasivasToolbar } from "@/features/facturacion/components/FacturasMasivasToolbar";
import { FacturasEmitidasFooter } from "@/features/facturacion/components/FacturasEmitidasFooter";
import { FacturaEmitidaMobileCard } from "@/features/facturacion/components/FacturaEmitidaMobileCard";
import EmptyState from "@/components/empty/EmptyState";
import { usePermissions } from "@/hooks/shared";
import type { Factura } from "@/features/facturacion/routes/facturacionColumns";
import { buildFacturasEmitidasChips } from "./facturasEmitidasChips";
import type { Database } from "@/types/db";
import { rangoLabel } from "@/lib/ui/rangoFechasCopy";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import type { FacturasEmitidasProps } from "./facturasEmitidasProps";

type EstadoFactura = Database["public"]["Enums"]["estado_factura"];
const ESTADOS_FACTURA: EstadoFactura[] = [
  "Borrador", "Por timbrar", "Emitida", "Parcialmente pagada", "Pagada", "Vencida", "Cancelada",
];

export function TabFacturasEmitidas({ filtros: f, tabla: t, acciones: a }: FacturasEmitidasProps) {
  const { canEmitirFactura } = usePermissions();
  const selection = useRowSelection();
  const [zipMesOpen, setZipMesOpen] = useState(false);
  const columnsConSeleccion = useMemo(
    () => [buildSelectionColumn<Factura>(), ...t.columns],
    [t.columns],
  );

  const chips = useMemo(() => buildFacturasEmitidasChips(f), [f]);
  const hayFiltros = Boolean(f.search || chips.length);
  const primarySlot = (
    <>
      <Select value={f.filterEstado} onValueChange={(v) => f.setFilter("estado", v)}>
        <SelectTrigger className={FILTRO_ANCHO.mdAuto} aria-label="Estado de la factura">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos los estados</SelectItem>
          {ESTADOS_FACTURA.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={f.filterCliente} onValueChange={(v) => f.setFilter("cliente", v)} disabled={f.loadingClientes || f.errorClientes}>
        <SelectTrigger className={FILTRO_ANCHO.lgAuto} aria-label="Cliente">
          <SelectValue placeholder={f.loadingClientes ? "Cargando clientes…" : "Cliente"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todos">Todos los clientes</SelectItem>
          {f.clientes.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {f.errorClientes && <div role="alert" className="text-body-sm text-destructive">
        No se pudieron cargar los clientes. <Button variant="link" size="sm" onClick={f.onRetryClientes}>Reintentar</Button>
      </div>}
    </>
  );
  const rangoFecha = (etiqueta: "desde" | "hasta", value: string, onChange: (v: string) => void) => (
    <div className="space-y-1.5">
      <label className="text-body-sm font-medium text-muted-foreground">{rangoLabel("Emisión", etiqueta)}</label>
      <DatePickerMx value={value} onChange={onChange} className="w-full" />
    </div>
  );
  const secondarySlot = (
    <div className="space-y-4">
      {rangoFecha("desde", f.fechaDesde, f.setFechaDesde)}
      {rangoFecha("hasta", f.fechaHasta, f.setFechaHasta)}
    </div>
  );

  return (
    <>
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-body-sm text-muted-foreground">
            Historial de facturas de todos los estados, incluidos borradores y por timbrar.
          </p>
          <div className="flex flex-wrap gap-3 items-start">
            <div className="flex-1 min-w-[240px]">
              <UnifiedFiltersBar
                search={f.search}
                onSearchChange={f.setSearch}
                searchPlaceholder="Buscar factura o cliente…"
                primary={primarySlot}
                secondary={secondarySlot}
                chips={chips}
                activeCount={chips.length}
                onClearAll={f.onClear}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="shrink-0 gap-2">
                  <Download className="h-4 w-4" />
                  <span>Exportar</span>
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem disabled={f.rangoInvertido} onClick={a.exportarFacturasCsv}>CSV de página actual</DropdownMenuItem>
                <DropdownMenuItem disabled={f.rangoInvertido} onClick={a.exportarLayoutContable} title="Layout contable con RFC, subtotal, IVA y total">
                  Layout de página actual
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setZipMesOpen(true)} title="Paquete PDF+XML de todos los CFDI del mes, generado por el PAC">
                  ZIP del mes (PAC)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {f.rangoInvertido ? (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="text-body-sm text-destructive">
                La fecha final de emisión es anterior a la inicial.
              </p>
              <Button variant="link" size="sm" onClick={f.limpiarRango}>Quitar rango de emisión</Button>
            </div>
          ) : (
            <div className="text-body-sm text-muted-foreground">
              <strong className="text-foreground">{t.facturasFiltradas.length}</strong> filas visibles
              {" · "}{t.totalFacturas} facturas con los filtros actuales
            </div>
          )}
        </CardContent>
      </Card>

      {!f.rangoInvertido && (
        <>
          <FacturasMasivasToolbar
            selectedIds={selection.selectedIds}
            onClear={selection.clear}
            onMarked={selection.remove}
          />

          <Card>
            <CardContent className="p-0">
              <ResponsiveDataTable
                columns={columnsConSeleccion}
                data={t.data}
                isLoading={t.isLoading}
                isError={t.isError}
                onRetry={t.onRetry}
                emptyMessage="No se encontraron facturas"
                emptyState={
                  <EmptyState
                    icon={Receipt}
                    title={hayFiltros ? "No se encontraron facturas" : "Aún no hay facturas"}
                    description={hayFiltros ? "Ajusta los filtros o busca con otro término." : "Las facturas creadas desde embarques o proformas aparecerán aquí."}
                    primaryAction={hayFiltros ? { label: "Limpiar filtros", onClick: f.onClear } : canEmitirFactura && a.onCreateNew ? { label: "Nueva factura", onClick: a.onCreateNew } : undefined}
                  />
                }
                rowKey={(f) => f.id}
                density={TABLE_DENSITY.listado}
                getRowHref={(f) => `/facturacion/${f.id}`}
                rowSelection={selection.rowSelection}
                onRowSelectionChange={selection.onRowSelectionChange}
                pagination={{
                  page: t.page,
                  totalPages: t.totalPages,
                  onPageChange: t.setPage,
                  pageSize: t.pageSize,
                  onPageSizeChange: (s) => { t.setPageSize(s); t.setPage(0); },
                  pageSizeOptions: [50, 100, 200, 500],
                  pageSizeLabels: { 500: "500" }, total: t.totalFacturas,
                }}
                mobileCard={(f) => <FacturaEmitidaMobileCard factura={f} />}
              />
            </CardContent>
          </Card>

          <FacturasEmitidasFooter facturas={t.facturasFiltradas} />
        </>
      )}

      <DialogDescargarZipMes open={zipMesOpen} onOpenChange={setZipMesOpen} />
    </>
  );
}

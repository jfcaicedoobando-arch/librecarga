/**
 * Bandeja "REP pendientes": pagos aplicados a facturas PPD cuyo REP no se
 * ha timbrado. Estados unificados vía `<BandejaShell />`.
 * v13.491.0 — timbrado desde la propia bandeja: botón por renglón y selección
 * múltiple para timbrar varios REP en una sola pasada.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ReceiptText } from "lucide-react";
import { FilteredListEmptyState } from "@/components/empty/FilteredListEmptyState";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { ConfirmActionDialog } from "@/components/shared/dialogs/ConfirmActionDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrgFilter } from "@/hooks/shared";
import { useRowSelection } from "@/components/shared/dataTable/useRowSelection";
import { buildSelectionColumn } from "@/components/shared/dataTable/buildSelectionColumn";
import { usePagosRepPendientes, type FilaRepPendiente } from "@/features/facturacion/hooks/useBandejas";
import { useTimbrarRepsLote } from "@/features/facturacion/hooks/useTimbrarRepsLote";
import { BandejaShell } from "./BandejaShell";
import { BandejaRepAcciones } from "./BandejaRepAcciones";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, toTitleCase } from "@/lib/formatters";
import { ReceiptText as ReceiptIcon } from "lucide-react";
import { buildRepPendientesColumns } from "./bandejaRepColumns";

export function BandejaRepPendientes() {
  const { organizationId } = useOrgFilter();
  return <BandejaRepPendientesContenido key={organizationId} organizationId={organizationId} />;
}

function BandejaRepPendientesContenido({ organizationId }: { organizationId: string | null }) {
  const paged = usePagosRepPendientes(organizationId);
  const selection = useRowSelection();
  const { timbrar, enProceso, progreso } = useTimbrarRepsLote();
  const [pagoEnProceso, setPagoEnProceso] = useState<string | null>(null);
  const [lotePorConfirmar, setLotePorConfirmar] = useState<ReadonlySet<string> | null>(null);
  const timbrando = useRef(false);
  const vistaNoDisponible = paged.isLoading || paged.isStaleView || Boolean(paged.error);
  const timbradoBloqueado = vistaNoDisponible || enProceso;
  const fueraDePagina = vistaNoDisponible ? 0 : selection.selectedCount - paged.rows.filter(
    (row) => selection.isSelected(row.id),
  ).length;

  const timbrarPagos = useCallback(async (ids: readonly string[], pagoId: string | null = null) => {
    if (timbradoBloqueado || timbrando.current || ids.length === 0) return false;
    timbrando.current = true;
    setPagoEnProceso(pagoId);
    try {
      await timbrar(ids);
      return true;
    } finally {
      timbrando.current = false;
      setPagoEnProceso(null);
    }
  }, [timbrar, timbradoBloqueado]);

  const timbrarSeleccion = async (ids: ReadonlySet<string>) => {
    const pagos = [...ids];
    if (await timbrarPagos(pagos)) {
      selection.remove(pagos);
      setLotePorConfirmar(null);
    }
  };

  const solicitarTimbrado = () => {
    if (timbradoBloqueado || timbrando.current || selection.selectedCount === 0) return;
    if (fueraDePagina > 0) {
      setLotePorConfirmar(selection.selectedIds);
      return;
    }
    void timbrarSeleccion(selection.selectedIds);
  };

  const columns = useMemo(
    () => [
      buildSelectionColumn<FilaRepPendiente>(),
      ...buildRepPendientesColumns({
        onTimbrar: (id) => void timbrarPagos([id], id),
        pagoEnProceso,
        bloqueado: timbradoBloqueado,
      }),
    ],
    [pagoEnProceso, timbradoBloqueado, timbrarPagos],
  );

  return (
    <BandejaShell
      isError={Boolean(paged.error)}
      onRetry={() => paged.refetch()}
      search={paged.search}
      onSearchChange={paged.setSearch}
      searchPlaceholder="Buscar factura o cliente…"
      chips={paged.activeChips}
      activeCount={paged.activeCount}
      onClearAll={paged.resetAll}
      primary={
        <Select value={paged.filters.estado} onValueChange={(v) => paged.setFilter("estado", v)}>
          <SelectTrigger className="w-[160px]" aria-label="Estado REP">
            <SelectValue placeholder="Estado REP" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="Pendiente">Pendiente</SelectItem>
            <SelectItem value="Error">Error</SelectItem>
          </SelectContent>
        </Select>
      }
      counter={paged.isStaleView ? "Actualizando…" : !paged.isLoading && !paged.error && (
        <>Mostrando <strong className="text-foreground">{paged.rows.length}</strong> de {paged.count} complementos pendientes</>
      )}
    >
      <BandejaRepAcciones
        seleccionados={selection.selectedCount}
        fueraDePagina={fueraDePagina}
        enProceso={enProceso}
        deshabilitado={vistaNoDisponible}
        progreso={progreso}
        onTimbrar={solicitarTimbrado}
        onLimpiar={selection.clear}
      />
      {lotePorConfirmar && (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => { if (!open && !timbrando.current) setLotePorConfirmar(null); }}
          title="Confirmar timbrado de REP"
          description={`El lote contiene ${lotePorConfirmar.size} REP.${fueraDePagina > 0 ? ` ${fueraDePagina} fuera de esta página.` : ""}`}
          confirmLabel="Timbrar lote"
          isPending={enProceso}
          confirmDisabled={vistaNoDisponible || lotePorConfirmar !== selection.selectedIds}
          onConfirm={async () => {
            if (lotePorConfirmar === selection.selectedIds) await timbrarSeleccion(lotePorConfirmar);
          }}
        />
      )}
      <Card>
        <CardContent className="p-0">
          <ResponsiveDataTable
            columns={columns}
            data={paged.isStaleView ? [] : paged.rows}
            isLoading={paged.isLoading || paged.isStaleView}
            emptyState={
              <FilteredListEmptyState
                filtered={Boolean(paged.search?.trim()) || paged.activeCount > 0}
                onClearFilters={paged.resetAll}
                icon={ReceiptText}
                message="Sin complementos de pago (REP) pendientes ante el SAT."
              />
            }
            rowKey={(r) => r.id}
            getRowHref={(r) => `/facturacion/${r.factura_id}`}
            getRowAriaLabel={(r) => `Abrir factura ${r.factura_numero}`}
            rowSelection={selection.rowSelection}
            onRowSelectionChange={selection.onRowSelectionChange}
            sortMode="server"
            controlledSort={paged.controlledSort}
            onSortChange={(key, dir) => { paged.setPage(0); paged.setSort(key, dir); }}
            pagination={paged.pagination}
            mobileCard={(r) => (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-body truncate font-mono">{r.factura_numero}</div>
                  <div className="text-body-sm text-muted-foreground truncate mt-0.5">{toTitleCase(r.cliente_nombre)}</div>
                  <div className="text-label text-muted-foreground mt-0.5">
                    {formatDate(r.fecha_pago)} · {formatCurrency(r.monto, r.moneda)}
                  </div>
                  <Badge variant={r.estado_rep === "Error" ? "destructive" : "outline"} className="mt-1">{r.estado_rep}</Badge>
                </div>
                <div data-no-row-nav onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={timbradoBloqueado}
                    loading={pagoEnProceso === r.id}
                    onClick={() => void timbrarPagos([r.id], r.id)}
                    aria-label={`Timbrar REP de la factura ${r.factura_numero}`}
                  >
                    {pagoEnProceso !== r.id && <ReceiptIcon className="mr-2 h-3.5 w-3.5" />}
                    Timbrar
                  </Button>
                </div>
              </div>
            )}
          />
        </CardContent>
      </Card>
    </BandejaShell>
  );
}

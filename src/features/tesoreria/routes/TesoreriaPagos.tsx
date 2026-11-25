/**
 * Tesorería › Pagos (libro maestro).
 *
 * Lista transversal de cobros de clientes, pagos a proveedores y anticipos,
 * con filtros por periodo, cuenta, moneda, método SAT y conciliación, más
 * drill-down a la factura y al movimiento bancario.
 */
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { useDocumentTitle } from "@/hooks/shared";
import { FilteredListEmptyState } from "@/components/empty/FilteredListEmptyState";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { useCuentasBancarias } from "@/features/tesoreria/hooks";
import { useLibroPagos } from "@/features/tesoreria/hooks/useLibroPagos";
import { useFiltrosLibroPagosUrl } from "@/features/tesoreria/hooks/useFiltrosLibroPagosUrl";
import {
  FILTROS_LIBRO_PAGOS_INICIALES, VISTA_LABELS, etiquetaTipoPagoLibro, filtrarPagos, metodosDisponibles,
  monedasDisponibles, totalesLibroPagos,
  type VistaLibroPagos,
} from "@/features/tesoreria/domain/libroPagos";
import { etiquetaCuenta } from "@/features/anticipos-proveedor/domain/etiquetaCuenta";
import { DetallePagoSheet } from "@/features/tesoreria/components/DetallePagoSheet";
import { refPagoDeLibro, type RefPago } from "@/features/tesoreria/domain/pagoDetalle";
import { libroPagosColumns } from "./_sections/libroPagosColumns";
import { LibroPagosMobileCard } from "@/features/tesoreria/components/LibroPagosMobileCard";
import { LibroPagosToolbar } from "./_sections/LibroPagosToolbar";
import { LibroPagosKpis } from "./_sections/LibroPagosKpis";
import { LibroPagosExportButtons } from "./_sections/LibroPagosExportButtons";
import { formatDate } from "@/lib/formatters";

export default function TesoreriaPagos() {
  useDocumentTitle("Tesorería · Pagos");
  const consultaCuentas = useCuentasBancarias();
  const cuentas = useMemo(
    () => (consultaCuentas.data ?? []).map((c) => ({ id: c.id, alias: etiquetaCuenta(c), moneda: c.moneda })),
    [consultaCuentas.data],
  );
  // M8 (Ola 8): periodo y filtros viven en la URL (enlace compartible).
  const { rango, setRango, filtros, actualizarFiltros } = useFiltrosLibroPagosUrl();
  const [pagoAbierto, setPagoAbierto] = useState<RefPago | null>(null);

  const { data: libro, organizationId, isLoading, isError, refetch } = useLibroPagos(rango.desde, rango.hasta);
  const pagos = useMemo(() => libro?.pagos ?? [], [libro]);

  const monedas = useMemo(() => monedasDisponibles(pagos), [pagos]);
  const metodos = useMemo(() => metodosDisponibles(pagos), [pagos]);
  const visibles = useMemo(() => filtrarPagos(pagos, filtros), [pagos, filtros]);
  const filtrosBase = { ...FILTROS_LIBRO_PAGOS_INICIALES, vista: filtros.vista };
  const hayResultadosAlLimpiar = visibles.length === 0 && filtrarPagos(pagos, filtrosBase).length > 0;
  const totales = useMemo(() => totalesLibroPagos(visibles), [visibles]);
  const columns = useMemo(() => libroPagosColumns(), []);
  const cuentaActiva = cuentas.find((cuenta) => cuenta.id === filtros.cuentaId);

  return (
    <PageContainer>
      <PageHeader
        title="Pagos"
        description="Cobros, pagos a proveedores, anticipos y sus devoluciones en un solo lugar"
        actions={
          <LibroPagosExportButtons
            pagos={visibles}
            rango={rango}
            totales={totales}
            organizationId={organizationId}
            filtros={filtros}
            totalPeriodo={pagos.length}
            cuentaActiva={cuentaActiva?.alias}
          />
        }
      />

      <Tabs
        value={filtros.vista}
        onValueChange={(v) => actualizarFiltros({ vista: v as VistaLibroPagos })}
      >
        <TabsList>
          {(Object.keys(VISTA_LABELS) as VistaLibroPagos[]).map((v) => (
            <TabsTrigger key={v} value={v}>{VISTA_LABELS[v]}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <LibroPagosToolbar
        cuentas={cuentas}
        consultaCuentas={consultaCuentas}
        monedas={monedas}
        metodos={metodos}
        filtros={filtros}
        onFiltrosChange={actualizarFiltros}
        rango={rango}
        onRangoChange={setRango}
      />

      <LibroPagosKpis totales={totales} isLoading={isLoading} isError={isError} />

      <div className="space-y-1">
        {!isError && (
          <p className="px-1 text-body-sm text-muted-foreground">
            {visibles.length} de {pagos.length} pagos del periodo
          </p>
        )}
        <ResponsiveDataTable
          columns={columns}
          data={visibles}
          rowKey={(p) => `${p.tipo}-${p.id}`}
          density={TABLE_DENSITY.listado}
          striped
          stickyHeader
          tableClassName="w-full"
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
          onRowClick={(p) => setPagoAbierto(refPagoDeLibro(p))}
          getRowAriaLabel={(p) => `Ver detalle: ${etiquetaTipoPagoLibro(p)} · ${p.contraparte ?? "la contraparte"} · ${p.referencia || p.documento_folio || formatDate(p.fecha)}`}
          emptyState={<FilteredListEmptyState filtered={hayResultadosAlLimpiar}
            message="No hay pagos registrados para este periodo y vista."
            onClearFilters={() => actualizarFiltros(filtrosBase)} />}
          mobileCard={(p) => <LibroPagosMobileCard row={p} />}
        />
      </div>

      <DetallePagoSheet
        ref_pago={pagoAbierto}
        onOpenChange={(open) => { if (!open) setPagoAbierto(null); }}
      />
    </PageContainer>
  );
}

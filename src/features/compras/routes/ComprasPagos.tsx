/**
 * /compras/pagos — Ola E. Listado global de pagos a proveedor.
 *
 * Muestra todos los pagos aplicados, con filtros por rango de fechas,
 * método de pago, moneda y búsqueda por folio/proveedor/referencia.
 * KPIs de total pagado por moneda y conteo. Exporta a CSV.
 *
 * P1-B: datos/estado/exportación viven en `useComprasPagosController`.
 */
import { useMemo } from "react";
import { Landmark, Download, Banknote, Coins, Euro, ListFilter, SearchX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { DataTable } from "@/components/shared/DataTable";
import SearchInput from "@/components/shared/SearchInput";
import { KpiCard } from "@/components/shared/KpiCard";
import { formatCurrency } from "@/lib/formatters";
import { buildPagosColumns } from "./_sections/pagosColumns";
import { DatePickerMx } from "@/components/ui/date-picker-mx";
import { RANGO_DESDE_LABEL, RANGO_HASTA_LABEL } from "@/lib/ui/rangoFechasCopy";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { ErrorState } from "@/components/shared/states/ErrorState";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import {
  useComprasPagosController,
  MONEDAS_FILTRO,
  type MonedaFiltro,
} from "../hooks/useComprasPagosController";

export default function ComprasPagos() {
  const {
    desde, setDesde, hasta, setHasta, errorRango,
    moneda, setMoneda, metodoPago, setMetodoPago, search, setSearch,
    rows, isLoading, isError, refetch,
    metodosDisponibles, totalMxn, totalUsd, totalEur, handleExport,
  } = useComprasPagosController();

  const columns = useMemo(() => buildPagosColumns(), []);
  const valorKpi = (valor: number | string) => isError ? "No disponible" : valor;
  const filtrosActivos = moneda !== "todas" || metodoPago !== "todos" || Boolean(search.trim());
  const limpiarFiltros = () => { setMoneda("todas"); setMetodoPago("todos"); setSearch(""); };

  return (
    <PageContainer width="wide">
      <PageHeader
        icon={<Landmark className="h-6 w-6 text-accent" />}
        title="Pagos a proveedor"
        description="Pagos y ajustes aplicados a facturas de proveedor."
        actions={
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!!errorRango || rows.length === 0}>
            <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
          </Button>
        }
      />

      {!errorRango && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard label="Registros en el período" value={valorKpi(rows.length)} loading={isLoading} icon={ListFilter} />
          <KpiCard label="Total pagado MXN" value={valorKpi(formatCurrency(totalMxn, "MXN"))} loading={isLoading} icon={Banknote} />
          <KpiCard label="Total pagado USD" value={valorKpi(formatCurrency(totalUsd, "USD"))} loading={isLoading} icon={Coins} />
          <KpiCard label="Total pagado EUR" value={valorKpi(formatCurrency(totalEur, "EUR"))} loading={isLoading} icon={Euro} />
        </div>
      )}

      <Card>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label htmlFor="p-desde">{RANGO_DESDE_LABEL}</Label>
            <DatePickerMx id="p-desde" value={desde} onChange={setDesde} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-hasta">{RANGO_HASTA_LABEL}</Label>
            <DatePickerMx id="p-hasta" value={hasta} onChange={setHasta} errorText={errorRango} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-moneda">Moneda</Label>
            <Select value={moneda} onValueChange={(v) => setMoneda(v as MonedaFiltro)}>
              <SelectTrigger id="p-moneda"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONEDAS_FILTRO.map((opcion) => (
                  <SelectItem key={opcion} value={opcion}>{opcion === "todas" ? "Todas" : opcion}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-metodo">Método de pago</Label>
            <Select value={metodoPago} onValueChange={setMetodoPago}>
              <SelectTrigger id="p-metodo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {metodosDisponibles.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-1">
            <Label>Buscar</Label>
            <SearchInput value={search} onChange={setSearch} placeholder="Folio o proveedor…" />
          </div>
        </CardContent>
      </Card>

      {!errorRango && <Card>
        <CardContent className="p-0">
          {isError ? (
            <ErrorState className="m-4" onRetry={() => void refetch()} />
          ) : (
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            emptyState={filtrosActivos ? (
              <EmptyStateInline icon={SearchX} message="Sin pagos que coincidan con la búsqueda o los filtros"
                hint="Conservamos el periodo seleccionado."
                action={{ label: "Limpiar búsqueda y filtros", onClick: limpiarFiltros }} />
            ) : undefined}
            emptyMessage="No hay pagos en el período seleccionado"
            emptyHint="Ajusta el rango de fechas o los filtros para ver resultados."
            emptyIcon={Landmark}
            rowKey={(r) => r.id}
            density={TABLE_DENSITY.embebida}
          />
          )}
        </CardContent>
      </Card>}
    </PageContainer>
  );
}

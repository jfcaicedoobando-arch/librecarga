import { ChevronLeft, ChevronRight, Download, Calendar, Info } from "lucide-react";
import { ActiveFilterChips } from "@/components/shared/ActiveFilterChips";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { FilteredListEmptyState } from "@/components/empty/FilteredListEmptyState";
import { ErrorStateInline } from "@/components/empty/ErrorStateInline";
import { toTitleCase } from "@/lib/formatters";
import { useTabProyeccionController } from "@/features/facturacion/hooks";
import { ProyeccionCierreSection } from "./proyeccion/ProyeccionCierreSection";
import { proyeccionColumns } from "./proyeccionColumns";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { ProyeccionMobileCard } from "./ProyeccionMobileCard";
import { getErrorMessage } from "@/lib/errors";
import { KpiGridSkeleton } from "@/components/shared/skeletons";

export function TabProyeccion() {
  const c = useTabProyeccionController();
  const k = c.kpis;
  const consultando = c.isLoading || c.isFetching;
  const disponible = !consultando && !c.error;
  const filtrosActivos = [
    { key: "cliente", value: c.filtroCliente, label: "Cliente", onRemove: () => c.setFiltroCliente("todos") },
    { key: "operador", value: c.filtroOperador, label: "Operador", onRemove: () => c.setFiltroOperador("todos") },
    { key: "estado", value: c.filtroEstado, label: "Estado", onRemove: () => c.setFiltroEstado("todos") },
  ].filter(({ value }) => value !== "todos");
  const filtrado = filtrosActivos.length > 0;

  const limpiarYEnfocar = () => {
    c.limpiarFiltros();
    requestAnimationFrame(() => document.getElementById("cierre-filtro-cliente")?.focus());
  };

  return (
    <div className="space-y-4">


      {/* Header: Selector de mes + Export */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={c.irMesAnterior}
              disabled={!c.puedeIrAtras}
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Select value={c.mesActual.key} onValueChange={c.setMesKey}>
              <SelectTrigger aria-label="Mes del reporte" className="w-[200px] font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {c.mesesDisponibles.slice().reverse().map((m) => (
                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={c.irMesSiguiente}
              disabled={!c.puedeIrAdelante}
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1" />

          {disponible && (
            <div className="text-body-sm text-muted-foreground hidden md:block">
              {filtrado ? `${k.totalExpedientes} de ${c.kpisGlobales.totalExpedientes}` : c.kpisGlobales.totalExpedientes} expedientes con ETA en {c.mesActual.label}
              {filtrado ? " (filtros aplicados)" : ""}
            </div>
          )}

          <Button variant="outline" onClick={c.exportarCsv} disabled={!disponible || c.grupos.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
        </CardContent>
      </Card>

      {c.error ? (
        <ErrorStateInline
          title="No se pudo cargar el cierre mensual"
          message={getErrorMessage(c.error)}
          onRetry={() => { void c.refetch(); }}
          retrying={c.isFetching}
        />
      ) : consultando ? (
        <div role="status" aria-label="Consultando el cierre mensual">
          <KpiGridSkeleton count={3} heightClass="h-32" desktopCols={3} />
        </div>
      ) : (
        <ProyeccionCierreSection k={k} mesLabel={c.mesActual.label} filtrado={filtrado} />
      )}

      {/* Nota de moneda */}
      <p className="text-body-sm text-muted-foreground flex items-center gap-1.5 px-1">
        <Info className="h-3 w-3" />
        Importes base sin impuestos, por ETA. Proyectado suma la venta facturada neta y los conceptos pendientes de emisión. Una nota de crédito reduce la venta neta sin reabrir conceptos ya facturados. Ventas emitidas netas de notas de crédito al tipo de cambio documental; proyección y costos al tipo de cambio del embarque.
      </p>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3">
          <Select value={c.filtroCliente} onValueChange={c.setFiltroCliente}>
            <SelectTrigger id="cierre-filtro-cliente" className="w-[220px]" aria-label="Filtrar por cliente">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los clientes</SelectItem>
              {c.clientesDisponibles.map((cli) => (
                <SelectItem key={cli} value={cli}>{toTitleCase(cli)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={c.filtroOperador} onValueChange={c.setFiltroOperador}>
            <SelectTrigger className="w-[200px]" aria-label="Filtrar por operador">
              <SelectValue placeholder="Operador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los operadores</SelectItem>
              {c.operadoresDisponibles.map((op) => (
                <SelectItem key={op} value={op}>{op}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={c.filtroEstado} onValueChange={(v) => c.setFiltroEstado(v as typeof c.filtroEstado)}>
            <SelectTrigger className="w-[180px]" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="Facturado">Facturado</SelectItem>
              <SelectItem value="Parcial">Parcialmente facturado</SelectItem>
              <SelectItem value="Pendiente">Pendiente de facturar</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <ActiveFilterChips
        chips={filtrosActivos}
        searchId="cierre-filtro-cliente"
        onClearAll={c.limpiarFiltros}
      />

      {/* Tabla de detalle */}
      {!c.error && <Card>
        <CardContent className="p-0">
          {!consultando && c.grupos.length === 0 ? (
            <FilteredListEmptyState
              icon={Calendar}
              message={`Sin embarques con ETA en ${c.mesActual.label}`}
              hint="Selecciona otro mes para consultar sus embarques."
              filtered={filtrado && c.kpisGlobales.totalExpedientes > 0}
              filteredHint="Limpia los filtros para ver los embarques disponibles en este mes."
              onClearFilters={limpiarYEnfocar}
            />
          ) : (
            <ResponsiveDataTable
              columns={proyeccionColumns}
              data={c.grupos}
              isLoading={consultando}
              rowKey={(g) => g.expediente}
              density={TABLE_DENSITY.listado}
              emptyMessage="Sin resultados con los filtros aplicados"
              getRowHref={(g) => g.embarqueIds[0] ? `/embarques/${g.embarqueIds[0]}` : null}
              mobileCard={(g) => <ProyeccionMobileCard grupo={g} />}
            />
          )}
        </CardContent>
      </Card>}
    </div>
  );
}

/**
 * /crm/actividades — Registro de actividades CRM con URL sync (Ola 2).
 *
 * Migrado a `useServerPagedList` + `<UnifiedFiltersBar />`:
 *   - Todo el estado (búsqueda, tipo, estado, responsable, orden, paginación)
 *     vive en la URL vía nuqs (`?q=&tipo=&estado=&resp=&sort=&dir=&page=&ps=`).
 *   - Soporta el shortcut `?filtro=vencidas`, que se resuelve SERVER-SIDE
 *     (pendientes + mías + `fecha_programada < now`), así que el contador y la
 *     paginación corresponden al conjunto vencido.
 */
import { useQueryState } from "nuqs";
import { X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CrmSubheader } from "@/features/crm/components/CrmSubheader";
import { ResponsiveDataTable } from "@/components/shared/dataTable/ResponsiveDataTable";
import { UnifiedFiltersBar } from "@/components/shared/filters/UnifiedFiltersBar";
import { useServerPagedList } from "@/hooks/shared/useServerPagedList";
import { usePermissions, useDocumentTitle } from "@/hooks/shared";
import { useAuth } from "@/lib/contexts/AuthContext";
import {
  ACTIVIDAD_SORTABLE_KEYS,
  type ActividadSortKey,
} from "@/features/crm/services/actividades";
import { listActividadesAgenda } from "@/features/crm/services/actividadEntidades";
import {
  type CrmActividadRow, type CrmActividadTipo,
} from "@/features/crm/hooks";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { queryKeys } from "@/lib/query";
import { pluralizar } from "@/lib/format/pluralizar";
import { baseActividadColumns, actividadActionColumn } from "./actividadesColumns";
import { TABLE_DENSITY } from "@/components/shared/dataTable/tableTokens";
import { ErrorState } from "@/components/shared/states/ErrorState";
import { EmptyStateInline } from "@/components/empty/EmptyStateInline";
import { ActividadesFiltros } from "@/features/crm/components/actividades/ActividadesFiltros";
import { actividadEntidadHref, actividadEntidadNombre } from "@/features/crm/domain/actividadEntidad";
import { ActividadMobileCard } from "@/features/crm/components/ActividadMobileCard";


type ActividadesFilters = { tipo: string; estado: string; responsable: string } & Record<string, string>;
const DEFAULTS: ActividadesFilters = { tipo: "todos", estado: "pendientes", responsable: "todos" };
const FILTROS_VENCIDAS = { estado: "pendientes", responsable: "mias" } as const;

function vacioActividades(busqueda: string, vencidas: boolean, limpiarBusqueda: () => void, restablecer: () => void) {
  return <EmptyStateInline message="No hay actividades con estos filtros."
    hint={vencidas ? "Vencidas muestra solo tus actividades pendientes." : undefined}
    action={busqueda.trim()
      ? { label: "Limpiar búsqueda", onClick: limpiarBusqueda }
      : { label: "Restablecer filtros", onClick: restablecer }} />;
}

export default function Actividades() {
  useDocumentTitle('Actividades CRM');
  const { canCrearActividad, canGestionarActividad } = usePermissions();
  const { user } = useAuth();
  const [filtroParam, setFiltroParam] = useQueryState("filtro");
  const vencidasOnly = filtroParam === "vencidas";

  const list = useServerPagedList<CrmActividadRow, ActividadesFilters>({
    queryKey: queryKeys.crm.actividades.paged(user?.id, vencidasOnly ? "vencidas" : "todas"),
    defaultFilters: DEFAULTS,
    filterLabels: { tipo: "Tipo", estado: "Estado", responsable: "Responsable" },
    defaultPageSize: 100,
    pageSizeOptions: [50, 100, 200, 500],
    defaultSort: { key: "fecha_programada", dir: "asc" },
    sortableKeys: ACTIVIDAD_SORTABLE_KEYS,
    fetcher: async ({ search, filters, sortKey, sortDir, page, pageSize }) => {
      const { data, count } = await listActividadesAgenda({
        search,
        tipo: (filters.tipo as CrmActividadTipo | "todos") ?? "todos",
        // v13.823.49 — `?filtro=vencidas` se resuelve en la consulta: pendientes,
        // del responsable actual y con fecha programada anterior a ahora.
        estado: vencidasOnly ? FILTROS_VENCIDAS.estado : ((filters.estado as "pendientes" | "completadas" | "todas") ?? "pendientes"),
        responsable: vencidasOnly ? FILTROS_VENCIDAS.responsable : ((filters.responsable as "mias" | "todos") ?? "todos"),
        vencidas: vencidasOnly,
        page,
        pageSize,
        userId: user?.id,
        userEmail: user?.email,
        sortKey: (sortKey ?? "fecha_programada") as ActividadSortKey,
        sortDir: sortDir ?? "asc",
      });
      return { rows: data, count };
    },
  });

  const filtrosVisibles = vencidasOnly ? { ...list.filters, ...FILTROS_VENCIDAS } : list.filters;
  const chips = vencidasOnly
    ? list.activeChips.filter(({ key }) => key !== "filter:estado" && key !== "filter:responsable")
    : list.activeChips;
  const activeCount = chips.length + Number(Boolean(list.search)) + Number(vencidasOnly);

  // P2-4: nunca exponer filas de la consulta anterior bajo filtros nuevos.
  const items = list.isStaleView ? [] : list.rows;
  const columns = canCrearActividad
    ? [...baseActividadColumns, actividadActionColumn((a) => canGestionarActividad(a.responsable_id))]
    : baseActividadColumns;

  const limpiarFiltro = () => { void setFiltroParam(null); };
  const limpiarTodo = () => {
    list.resetAll();
    if (vencidasOnly) limpiarFiltro();
  };
  return (
    <PageContainer width="wide" id="crm-actividades">
      <PageHeader
        title="Actividades"
        description="Registro de llamadas, reuniones y tareas de seguimiento CRM"
      />
      <CrmSubheader
        context={list.isStaleView ? "Actualizando…" : pluralizar(list.count, "actividad", { plural: "actividades" })}
        actions={vencidasOnly ? (
          <Button variant="outline" size="sm" onClick={limpiarFiltro} className="h-7" aria-label="Quitar filtro Vencidas">
            <X className="h-3 w-3 mr-1" /> Filtro: Vencidas
          </Button>
        ) : undefined}
      />

      <UnifiedFiltersBar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Buscar por asunto…"
        chips={chips}
        activeCount={activeCount}
        onClearAll={limpiarTodo}
        primary={
          <ActividadesFiltros filters={filtrosVisibles} onChange={list.setFilter} vencidasOnly={vencidasOnly} />
        }
      />
      {vencidasOnly && (
        <p className="text-body-sm text-muted-foreground">Vencidas muestra tus actividades pendientes. Quita ese filtro para cambiar el estado o el responsable.</p>
      )}
      {activeCount > 0 && (
        <p className="text-body-sm text-muted-foreground">Esta vista está filtrada. Las actividades nuevas se mostrarán sólo si coinciden con los filtros.</p>
      )}
      <Card>
        <CardContent className="p-0">
          {items.some(a => a.entidad_estado === "error") && (
            <div role="status" className="flex flex-wrap items-center gap-2 border-b p-3 text-body-sm text-muted-foreground">
              Algunos nombres no se pudieron consultar. Las actividades siguen disponibles.
              <Button variant="outline" size="sm" onClick={() => void list.refetch()}>Reintentar nombres</Button>
            </div>
          )}
          {list.error ? (
            <ErrorState className="m-4" onRetry={() => void list.refetch()} />
          ) : (
          <ResponsiveDataTable
            columns={columns}
            data={items}
            isLoading={list.isLoading || list.isStaleView}
            emptyMessage="Sin actividades"
            emptyState={activeCount > 0 && vacioActividades(list.search, vencidasOnly, () => list.setSearch(""), limpiarTodo)}
            rowKey={(a) => a.id}
            getRowHref={actividadEntidadHref}
            getRowAriaLabel={a => `Abrir ${actividadEntidadNombre(a)} · ${a.asunto}`}
            density={TABLE_DENSITY.listado}
            sortMode="server"
            controlledSort={list.controlledSort}
            onSortChange={(key, dir) => list.setSort(key, dir)}
            pagination={{
              ...list.pagination,
              pageSizeOptions: [50, 100, 200, 500],
              pageSizeLabels: { 500: "500" },
            }}
            tableClassName="w-full table-fixed"
            mobileCard={(actividad) => (
              <ActividadMobileCard
                actividad={actividad}
                puedeGestionar={canCrearActividad && canGestionarActividad(actividad.responsable_id)}
              />
            )}
          />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

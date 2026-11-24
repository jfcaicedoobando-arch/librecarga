/** Cotizaciones: filtros, paginación y exportación con lecturas de servidor. */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerPagedList } from "@/hooks/shared/useServerPagedList";
import { useOrgFilter } from "@/hooks/shared/useOrgFilter";
import { useClientesForSelect } from "@/features/cliente/hooks/useClientes";
import { usePermissions } from "@/hooks/shared/usePermissions";
import { useAuth } from "@/lib/contexts/AuthContext";
import { staleTimes } from "@/lib/query/staleTimes";
import { useCotizacionActions } from "./useCotizacionActions";
import {
  fetchCotizacionesPaginadas,
  fetchTodasCotizacionesParaExportar,
  SORT_KEY_TO_COLUMN,
  type CotizacionesFiltrosSql,
} from "@/features/cotizacion/services/paginados";
import { fetchCotizacionAgregados } from "@/features/cotizacion/services/agregados";
import { estadoCompatibleConAceptadasSinEmbarque } from "@/features/cotizacion/domain/filtroAceptadasSinEmbarque";
import type { CotizacionListItem, SegmentoCotizacion } from "@/features/cotizacion/services/cotizacionListTypes";

export const ESTADOS_COTIZACION = [
  "Borrador",
  "Solicitada",
  "Enviada",
  "Aceptada",
  "Rechazada",
  "Vencida",
  "Archivada",
  "En operación",
];

// re-export for backward-compat with prior single-file controller.
export { useCotizacionActions };
export type { CotizacionListItem, SegmentoCotizacion };

const DEFAULT_FILTERS = {
  estado: "todos",
  cliente: "todos",
  sinCostos: "no",
  incluirInactivas: "no",
  aceptadasSinEmbarque: "no",
  reaprobacion: "no",
  // Por defecto se muestran las cotizaciones a clientes; la prospección
  // (CRM) vive en su propio segmento para no mezclar embudos.
  segmento: "clientes",
} as const;

type CotizacionFilters = Record<keyof typeof DEFAULT_FILTERS, string>;

const SORTABLE_KEYS = Object.keys(SORT_KEY_TO_COLUMN);
function normalizarSegmento(valor: string): SegmentoCotizacion {
  return valor === "prospectos" || valor === "todas" ? valor : "clientes";
}

function aFiltrosSql(
  organizationId: string | null,
  search: string,
  filters: CotizacionFilters,
  operadorEmail: string | null,
): CotizacionesFiltrosSql {
  const pendientes = filters.reaprobacion === "pendiente";
  return {
    organizationId,
    search,
    filterEstado: filters.estado,
    filterCliente: filters.cliente,
    filterSinCostos: filters.sinCostos === "si",
    incluirInactivas: pendientes || filters.incluirInactivas === "si",
    soloAceptadasSinEmbarque: filters.aceptadasSinEmbarque === "si",
    segmento: pendientes ? "todas" : normalizarSegmento(filters.segmento),
    reaprobacionOperador: pendientes ? operadorEmail : undefined,
  };
}

export function useCotizacionesPageController() {
  const { canWriteCotizaciones: canEdit } = usePermissions();
  const { organizationId, orgListo } = useOrgFilter();
  const { user } = useAuth();
  const operadorEmail = orgListo ? user?.email ?? null : null;
  const { data: clientes = [] } = useClientesForSelect();
  const actions = useCotizacionActions();

  const listQueryKey = ["cotizaciones", "paginadas", organizationId, operadorEmail];
  const lista = useServerPagedList<CotizacionListItem, CotizacionFilters>({
    queryKey: listQueryKey,
    defaultFilters: { ...DEFAULT_FILTERS },
    defaultPageSize: 50,
    defaultSort: { key: "fecha", dir: "desc" },
    sortableKeys: SORTABLE_KEYS,
    filterLabels: {
      estado: "Estado",
      cliente: "Cliente",
      sinCostos: "Sin costos",
      incluirInactivas: "Incl. inactivas",
      aceptadasSinEmbarque: "Aceptadas sin embarque",
      // El segmento se controla con tabs propios, no como chip de filtro.
      segmento: "Segmento",
    },
    fetcher: (args) =>
      fetchCotizacionesPaginadas({
        ...aFiltrosSql(organizationId, args.search, args.filters, operadorEmail),
        page: args.page,
        pageSize: args.pageSize,
        sortKey: args.sortKey,
        sortDir: args.sortDir,
      }),
  });

  const { setFilter } = lista;
  const soloAceptadasSinEmbarque = lista.filters.aceptadasSinEmbarque === "si";
  const estadoIncompatible = soloAceptadasSinEmbarque &&
    !estadoCompatibleConAceptadasSinEmbarque(lista.filters.estado);
  // Un enlace anterior puede contener ambos filtros. La bandeja es el más específico.
  useEffect(() => {
    if (estadoIncompatible) setFilter("estado", DEFAULT_FILTERS.estado);
  }, [estadoIncompatible, setFilter]);

  const filtrosActuales = aFiltrosSql(organizationId, lista.search, lista.filters, operadorEmail);
  const soloMisReaprobaciones = lista.filters.reaprobacion === "pendiente";
  const { segmento, incluirInactivas } = filtrosActuales;

  // COT-NEW-01: los conteos comparten el filtro de vigencia con la tabla.
  const agregadosQueryKey = ["cotizaciones", "agregados", organizationId, segmento, incluirInactivas];
  const consultaAgregados = useQuery({
    queryKey: agregadosQueryKey,
    queryFn: () => fetchCotizacionAgregados(organizationId, segmento, incluirInactivas),
    staleTime: staleTimes.MEDIUM,
  });
  const agregados = consultaAgregados.isError ? undefined : consultaAgregados.data;

  const activeChips = lista.activeChips.flatMap((chip) => {
    if (chip.key === "filter:estado" && estadoIncompatible) return [];
    if (soloMisReaprobaciones && ["filter:segmento", "filter:incluirInactivas"].includes(chip.key)) return [];
    if (chip.key === "filter:reaprobacion") {
      return soloMisReaprobaciones ? [{ ...chip, label: "Mis cotizaciones pendientes de reaprobación" }] : [];
    }
    return [chip];
  });

  return {
    // datos
    isLoading: lista.isLoading,
    isPlaceholderData: lista.isPlaceholderData,
    actualizandoResultados: lista.isStaleView,
    isError: !!lista.error,
    refetch: lista.refetch,
    clientes,
    paginated: lista.rows,
    /** Total del servidor (ya no es el largo del array en memoria). */
    total: lista.count,
    kpis: agregados?.kpis,
    errorAgregados: consultaAgregados.isError,
    consultandoAgregados: consultaAgregados.isFetching,
    reintentarAgregados: consultaAgregados.refetch,
    canEdit,
    // filtros
    search: lista.search,
    filterEstado: estadoIncompatible ? DEFAULT_FILTERS.estado : lista.filters.estado,
    filterCliente: lista.filters.cliente,
    filterSinCostos: lista.filters.sinCostos === "si",
    incluirInactivas: lista.filters.incluirInactivas === "si",
    soloAceptadasSinEmbarque,
    soloMisReaprobaciones,
    segmento,
    segmentoConteos: agregados?.segmentoConteos,
    totalAceptadasSinEmbarque: agregados?.totalAceptadasSinEmbarque ?? 0,
    page: lista.page,
    pageSize: lista.pageSize,
    totalPages: lista.totalPages,
    setSearch: lista.setSearch,
    setFilter,
    setPage: lista.setPage,
    setPageSize: lista.setPageSize,
    controlledSort: lista.controlledSort,
    setSort: lista.setSort,
    pagination: lista.pagination,
    // UnifiedFiltersBar
    activeChips,
    activeCount: activeChips.length + Number(Boolean(lista.search)),
    resetAll: lista.resetAll,
    // acciones (delegadas a useCotizacionActions)
    cotizacionAEliminar: actions.cotizacionAEliminar,
    setCotizacionAEliminar: actions.setCotizacionAEliminar,
    isDeleting: actions.isDeleting,
    confirmarEliminar: actions.confirmarEliminar,
    /** YG-03: el CSV trae TODO lo filtrado (iterando por lotes), no la página. */
    exportando: actions.exportando,
    exportar: () =>
      actions.exportar(() =>
        fetchTodasCotizacionesParaExportar(filtrosActuales, lista.sortKey, lista.sortDir),
      ),
    irANueva: actions.irANueva,
    irAEditar: actions.irAEditar,
    irADetalle: actions.irADetalle,
    prefetchCotizacion: actions.prefetchCotizacion,
  };
}

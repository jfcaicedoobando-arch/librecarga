import { useMemo } from "react";
import { useListPageState, useDebounce, usePermissions } from "@/hooks/shared";
import { useFacturasListado, useClientesFacturas } from "@/features/facturacion/hooks/useFacturas";
import { useExportarFacturasEmitidas } from "./useExportarFacturasEmitidas";
/**
 * Controller para la página de Facturación.
 * Encapsula filtros, búsqueda, paginación, mutaciones y export CSV.
 *
 * v13.317.3 (P7) — paginación server-side vía `useFacturasListado`.
 * Todos los filtros y el conteo se aplican en SQL antes de paginar.
 */
export function useFacturacionPageController(opts: {
  fechaDesde?: string | null;
  fechaHasta?: string | null;
  activeTab?: string;
} = {}) {
  const { activeTab, fechaDesde, fechaHasta } = opts;
  const {
    search, filters, page, pageSize,
    setSearch, setFilter, setPage, setPageSize,
  } = useListPageState({ estado: "todos", cliente: "todos" }, 100, [50, 100, 200, 500]);
  const filterEstado = filters.estado;
  const filterCliente = filters.cliente;

  // Debounce del search para no disparar refetch por tecla (300ms alineado
  // con los patrones de Embarques y CxP).
  const debouncedSearch = useDebounce(search, 300);

  // Lazy fetching por tab activo (J de la auditoría). Sólo se aplica al listado
  // pesado de facturas; el resto se mantiene siempre activo para alimentar
  // badges/contadores que se ven desde cualquier tab.
  // El id real de la bandeja de emitidas es "emitidas": con "facturas" el
  // guard nunca coincidía y la query pesada quedaba habilitada en todos los tabs.
  const facturasEnabled = activeTab === undefined || activeTab === "emitidas";
  const rangoInvertido = !!fechaDesde && !!fechaHasta && fechaDesde > fechaHasta;
  const listadoHabilitado = facturasEnabled && !rangoInvertido;

  const filtrosConsulta = {
    search: debouncedSearch,
    estado: filterEstado,
    clienteNombre: filterCliente === "todos" ? undefined : filterCliente,
    fechaDesde: fechaDesde || undefined,
    fechaHasta: fechaHasta || undefined,
  };
  const {
    data: listado, isLoading, isError: errorFacturas, isPlaceholderData, refetch: refetchFacturas,
  } = useFacturasListado({
    ...filtrosConsulta,
    page,
    pageSize,
    enabled: listadoHabilitado,
  });
  const facturas = useMemo(() => listado?.data ?? [], [listado]);
  const totalCount = listado?.count ?? 0;
  const { canEdit } = usePermissions();
  const loadingFacturas = isLoading || isPlaceholderData || search !== debouncedSearch;
  const exportacion = useExportarFacturasEmitidas(filtrosConsulta,
    listadoHabilitado && !loadingFacturas && !errorFacturas && totalCount > 0);

  const clientesQuery = useClientesFacturas(facturasEnabled);
  const clientesDisponibles = useMemo(() => (clientesQuery.data ?? []).map((nombre) => ({ id: nombre, nombre })), [clientesQuery.data]);
  const filtered = facturas;
  const paginatedFacturas = facturas;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  return {
    // estado
    search, setSearch,
    filterEstado, filterCliente, setFilter,
    page, setPage,
    pageSize, setPageSize,
    // datos
    facturas,
    facturasFiltradas: filtered,
    paginatedFacturas,
    totalPages,
    totalCount,
    rangoInvertido,
    clientesDisponibles,
    loadingClientes: clientesQuery.isLoading,
    errorClientes: clientesQuery.isError,
    refetchClientes: () => void clientesQuery.refetch(),

    loadingFacturas,
    // P1-1: la tabla debe pintar error + retry, no un empty-state engañoso.
    errorFacturas,
    refetchFacturas: () => void refetchFacturas(),
    // permisos / mutaciones
    canEdit,
    ...exportacion,
  };
}


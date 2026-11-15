import { useMemo, useCallback } from "react";
import { useListPageState, useDebounce } from "@/hooks/shared";
import { exportToCsv } from "@/generators/exportCsv";
import { exportarLayoutContable } from "@/generators/layoutContable";
import { useFacturasListado, useClientesFacturas } from "@/features/facturacion/hooks/useFacturas";
import { useRegistrarActividad } from "@/hooks/shared";
import { usePermissions } from "@/hooks/shared";

import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";

import { todayLocalISO } from "@/lib/date/today";
/**
 * Controller para la página de Facturación.
 * Encapsula filtros, búsqueda, paginación, mutaciones y export CSV.
 *
 * v13.317.3 (P7) — paginación server-side vía `useFacturasListado`.
 * Todos los filtros y el conteo se aplican en SQL antes de paginar.
 */
export function useFacturacionPageController(opts?: {
  fechaDesde?: string | null;
  fechaHasta?: string | null;
  activeTab?: string;
}) {
  const activeTab = opts?.activeTab;
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

  const { data: listado, isLoading: loadingFacturas, isError: errorFacturas, refetch: refetchFacturas } = useFacturasListado({
    page,
    pageSize,
    search: debouncedSearch,
    estado: filterEstado,
    clienteNombre: filterCliente === "todos" ? undefined : filterCliente,
    fechaDesde: opts?.fechaDesde || undefined,
    fechaHasta: opts?.fechaHasta || undefined,
    enabled: facturasEnabled,
  });
  const facturas = useMemo(() => listado?.data ?? [], [listado]);
  const totalCount = listado?.count ?? 0;
  const { canEdit } = usePermissions();
  const registrarActividad = useRegistrarActividad();

  const clientesQuery = useClientesFacturas(facturasEnabled);
  const clientesDisponibles = useMemo(() => (clientesQuery.data ?? []).map((nombre) => ({ id: nombre, nombre })), [clientesQuery.data]);
  const filtered = facturas;
  const paginatedFacturas = facturas;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));



  const exportarFacturasCsv = useCallback(() => {
    exportToCsv(
      `facturas_${todayLocalISO()}.csv`,
      [
        { key: "numero", label: "# Factura" },
        { key: "expediente", label: "Expediente" },
        { key: "cliente", label: "Cliente" },
        { key: "total", label: "Monto" },
        { key: "moneda", label: "Moneda" },
        { key: "emision", label: "Emisión" },
        { key: "vencimiento", label: "Vencimiento" },
        { key: "estado", label: "Estado" },
      ],
      filtered.map(f => ({
        numero: f.numero,
        expediente: f.expediente,
        cliente: f.cliente_nombre,
        total: f.total,
        moneda: f.moneda,
        emision: f.fecha_emision,
        vencimiento: f.fecha_vencimiento,
        estado: f.estado,
      })),
    );
  }, [filtered]);

  const exportarLayoutContableHandler = useCallback(async () => {
    try {
      await exportarLayoutContable(filtered);
      registrarActividad.mutate({
        accion: 'exportar',
        modulo: 'facturas',
        entidad_id: 'layout_contable',
        entidad_nombre: `Layout contable (${filtered.length} facturas)`,
      });
      notifySuccess(undefined, { title: "Layout contable generado" });
    } catch (error) {
      notifyError(undefined, { title: "Error al generar layout contable", error,
        method: "FACTURACION_EXPORTAR_LAYOUT_CONTABLE", context: { cantidadFacturas: filtered.length } });
    }
  }, [filtered, registrarActividad]);

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
    exportarFacturasCsv,
    exportarLayoutContable: exportarLayoutContableHandler,
  };
}


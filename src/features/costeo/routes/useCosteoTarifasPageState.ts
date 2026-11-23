/** Estado y handlers de la página `CosteoTarifas`. */
import { useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router";
import { useOrgActiva } from "@/hooks/shared/useOrgActiva";
import { safeLocalStorage, STORAGE_KEYS } from "@/lib/browserStorage";
import { useCosteoTarifas, useCosteoTarifaMutations } from "@/features/costeo/hooks/useCosteoTarifas";
import type { TarifaInput } from "@/features/costeo/services/tarifas";
import type { CosteoTarifaRow } from "@/features/costeo/types";
import {
  buildInitialFromTarifa, seleccionarTarifasCatalogo,
  type EstadoFiltro, type AprobacionFiltro,
} from "./CosteoTarifas.helpers";
import { todayLocalISO } from "@/lib/date/today";

export type ViewMode = "agrupada" | "tabla";
const DEFAULT_APROB: AprobacionFiltro = "todas";
const DEFAULT_ESTADO: EstadoFiltro = "todas";
function readViewMode(): ViewMode {
  return safeLocalStorage.getItem(STORAGE_KEYS.tarifasViewMode) === "tabla" ? "tabla" : "agrupada";
}

function readAprobacionFromUrl(value: string | null): AprobacionFiltro {
  return value === "borrador" || value === "vigente" || value === "programada" || value === "rechazada"
    ? value
    : DEFAULT_APROB;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useCosteoTarifasPageState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { organizationId } = useOrgActiva();
  const rutaIdFromUrl = searchParams.get("ruta") ?? undefined;

  const [estado, setEstado] = useState<EstadoFiltro>(DEFAULT_ESTADO);
  const aprobacion = readAprobacionFromUrl(searchParams.get("aprobacion"));
  const cambiarAprobacion = useCallback((valor: AprobacionFiltro) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (valor === DEFAULT_APROB) next.delete("aprobacion");
      else next.set("aprobacion", valor);
      return next;
    });
    if (valor === "programada") setSoloPorVencer(false);
  }, [setSearchParams]);
  const [agenteId, setAgenteId] = useState<string>("todos");
  const [tipoId, setTipoId] = useState<string>("todos");
  const [busqueda, setBusqueda] = useState("");
  // P1-3: filtro explícito "Por vencer ≤ 7 días" (no es sinónimo de Vigentes).
  const [filtroPorVencer, setSoloPorVencer] = useState(false);
  const soloPorVencer = filtroPorVencer && aprobacion !== "programada" && aprobacion !== "borrador";
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<Partial<TarifaInput> | undefined>();
  const [editId, setEditId] = useState<string | undefined>();
  const [tarifaAEliminar, guardarTarifaAEliminar] = useState<CosteoTarifaRow | null>(null);
  const aEliminar = tarifaAEliminar?.organization_id === organizationId ? tarifaAEliminar : null;
  const [viewMode, setViewMode] = useState<ViewMode>(readViewMode);
  const changeView = useCallback((v: ViewMode) => {
    setViewMode(v);
    safeLocalStorage.setItem(STORAGE_KEYS.tarifasViewMode, v);
  }, []);

  const tarifaFilters = useMemo(
    () => ({
      estado,
      agenteId: agenteId === "todos" ? undefined : agenteId,
      tipoContenedorId: tipoId === "todos" ? undefined : tipoId,
      rutaId: rutaIdFromUrl,
    }),
    [estado, agenteId, tipoId, rutaIdFromUrl],
  );

  const { data: tarifas = [], isLoading, isError, refetch } = useCosteoTarifas(tarifaFilters);
  const { eliminar } = useCosteoTarifaMutations();
  const { tarifasFiltradas, pendientesCount, programadasCount } = useMemo(
    () => seleccionarTarifasCatalogo(tarifas, { aprobacion, busqueda, soloPorVencer }, todayLocalISO()),
    [tarifas, aprobacion, busqueda, soloPorVencer],
  );

  const hasActiveFilters =
    aprobacion !== DEFAULT_APROB ||
    estado !== DEFAULT_ESTADO ||
    agenteId !== "todos" ||
    tipoId !== "todos" ||
    soloPorVencer ||
    !!rutaIdFromUrl ||
    busqueda.trim() !== "";

  const activeKpi: "pendientes" | "porVencer" | null =
    aprobacion === "borrador" ? "pendientes"
      : soloPorVencer ? "porVencer"
      : null;

  const clearAll = useCallback(() => {
    setEstado(DEFAULT_ESTADO);
    setAgenteId("todos");
    setTipoId("todos");
    setBusqueda("");
    setSoloPorVencer(false);
    // P2-A2: "Limpiar filtros" también quita la ruta y la aprobación del URL.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("ruta");
      next.delete("aprobacion");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const clearRutaUrl = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("ruta");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const openFormFrom = useCallback((id: string | undefined, init: Partial<TarifaInput> | undefined) => {
    setEditId(id);
    setInitial(init);
    setOpen(true);
  }, []);

  const findTarifa = useCallback(
    (id: string): CosteoTarifaRow | undefined => tarifas.find((x) => x.id === id),
    [tarifas],
  );

  const setAEliminar = useCallback((id: string | null) => {
    guardarTarifaAEliminar(id ? findTarifa(id) ?? null : null);
  }, [findTarifa]);

  const duplicar = useCallback((id: string) => {
    const t = findTarifa(id);
    if (!t) return;
    openFormFrom(undefined, {
      ...buildInitialFromTarifa(t),
      vigente_desde: todayLocalISO(),
    });
  }, [findTarifa, openFormFrom]);

  const editar = useCallback((id: string) => {
    const t = findTarifa(id);
    if (!t) return;
    openFormFrom(id, buildInitialFromTarifa(t));
  }, [findTarifa, openFormFrom]);

  // P2-A3: desde una ruta filtrada, "Nueva tarifa" la preselecciona.
  const nuevo = useCallback(
    () => openFormFrom(undefined, rutaIdFromUrl && UUID_RE.test(rutaIdFromUrl) ? { ruta_id: rutaIdFromUrl } : undefined),
    [openFormFrom, rutaIdFromUrl],
  );

  // P2-A4: cada KPI restablece los filtros incompatibles con su universo.
  const onFilterPendientes = useCallback(() => {
    setSoloPorVencer(false);
    setEstado(DEFAULT_ESTADO);
    cambiarAprobacion("borrador");
  }, [cambiarAprobacion]);
  const onFilterPorVencer = useCallback(() => {
    cambiarAprobacion(DEFAULT_APROB);
    setEstado(DEFAULT_ESTADO);
    setSoloPorVencer(true);
  }, [cambiarAprobacion]);

  return {
    // url
    rutaIdFromUrl,
    clearRutaUrl,
    // datos
    tarifas,
    tarifasFiltradas,
    isLoading,
    isError,
    refetch,
    pendientesCount,
    programadasCount,
    // filtros
    estado, setEstado,
    aprobacion, setAprobacion: cambiarAprobacion,
    agenteId, setAgenteId,
    tipoId, setTipoId,
    busqueda, setBusqueda,
    soloPorVencer, setSoloPorVencer,
    hasActiveFilters,
    clearAll,
    activeKpi,
    onFilterPendientes,
    onFilterPorVencer,
    // vista
    viewMode, changeView,
    // form
    open, setOpen, initial, editId,
    nuevo, editar, duplicar,
    // delete
    aEliminar, setAEliminar, eliminar,
  };
}

export { DEFAULT_APROB, DEFAULT_ESTADO };

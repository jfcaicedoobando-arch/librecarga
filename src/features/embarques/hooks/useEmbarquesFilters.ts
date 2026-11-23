/**
 * Estado de filtros y ordenamiento para la página de embarques (extraído de
 * `useEmbarquesPageState` para reducir complejidad).
 */
import { useCallback } from "react";
import {
  useQueryState,
  useQueryStates,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs";
import { useDebounce } from "@/hooks/shared";

// v13.139.17 — default reducido de 100 → 50 para evitar páginas de 4700px+
// en monitores Full HD. El usuario puede subir hasta 500 desde el selector.
const DEFAULT_PAGE_SIZE = 50;


const SORT_DIR_PARSER = parseAsStringLiteral(["asc", "desc"] as const).withDefault("desc");
const ALERTA_PARSER = parseAsStringLiteral([
  "todos",
  "demora",
  "garantia",
  "cierre_operativo",
  "admin_pendiente",
] as const).withDefault("todos");

export type EmbarqueAlertaFiltro =
  | "todos"
  | "demora"
  | "garantia"
  | "cierre_operativo"
  | "admin_pendiente";

export const EMBARQUES_SECONDARY_FILTER_DEFAULTS = {
  modo: "todos", operador: "todos", fechaDesde: "", fechaHasta: "",
};

export const EMBARQUES_FILTER_DEFAULTS = {
  estado: "todos", cliente: "todos", ...EMBARQUES_SECONDARY_FILTER_DEFAULTS,
};

export type EmbarquesFilterValues = typeof EMBARQUES_FILTER_DEFAULTS;

export function useEmbarquesFilters() {
  const [search, setSearchRaw] = useQueryState("q", parseAsString.withDefault(""));
  const [{ page: pageFromUrl, ...filters }, setFiltersAndPage] = useQueryStates({
    modo: parseAsString.withDefault(EMBARQUES_FILTER_DEFAULTS.modo),
    estado: parseAsString.withDefault(EMBARQUES_FILTER_DEFAULTS.estado),
    cliente: parseAsString.withDefault(EMBARQUES_FILTER_DEFAULTS.cliente),
    operador: parseAsString.withDefault(EMBARQUES_FILTER_DEFAULTS.operador),
    fechaDesde: parseAsString.withDefault(EMBARQUES_FILTER_DEFAULTS.fechaDesde),
    fechaHasta: parseAsString.withDefault(EMBARQUES_FILTER_DEFAULTS.fechaHasta),
    page: parseAsInteger.withDefault(0),
  });
  const [alerta, setAlertaRaw] = useQueryState("alerta", ALERTA_PARSER);
  const setPageRaw = useCallback((value: number | null) => setFiltersAndPage({ page: value }), [setFiltersAndPage]);
  const [pageSizeFromUrl, setPageSizeRaw] = useQueryState(
    "ps",
    parseAsInteger.withDefault(DEFAULT_PAGE_SIZE),
  );
  const pageSize = Math.min(500, Math.max(1, pageSizeFromUrl));
  const page = Math.min(Math.floor(2_147_483_647 / pageSize), Math.max(0, pageFromUrl));
  const [sortKey, setSortKeyRaw] = useQueryState("sort", parseAsString.withDefault("expediente"));
  const [sortDir, setSortDirRaw] = useQueryState("dir", SORT_DIR_PARSER);

  const debouncedSearch = useDebounce(search, 300);

  const setFilter = (key: keyof typeof filters, value: string, defaultValue: string) => {
    void setFiltersAndPage({ [key]: value === defaultValue ? null : value, page: null });
  };

  const applyFilters = (next: Partial<EmbarquesFilterValues>) => {
    const keys = Object.keys(next) as (keyof EmbarquesFilterValues)[];
    if (keys.some((key) => next[key] !== filters[key])) {
      void setFiltersAndPage({ ...next, page: null });
    }
  };

  return {
    search,
    debouncedSearch,
    filters,
    alerta: alerta as EmbarqueAlertaFiltro,
    page,
    pageSize,
    sortKey,
    sortDir,
    DEFAULT_PAGE_SIZE,
    setSearch: (v: string) => { setSearchRaw(v || null); setPageRaw(null); },
    setFilter,
    applyFilters,
    setAlerta: (v: EmbarqueAlertaFiltro) => {
      setAlertaRaw(v === "todos" ? null : v);
      setPageRaw(null);
    },
    setPageRaw,
    setPageSizeRaw,
    setSortKeyRaw,
    setSortDirRaw,
  };
}

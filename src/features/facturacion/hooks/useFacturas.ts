import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query";
import { fetchFacturasPagina, fetchClientesFacturas } from "../services/facturasPagina";
import { useOrgFilter } from "@/hooks/shared";
import {
  fetchFacturas,
} from "@/features/facturacion/services";


export function useFacturas(opts: { enabled?: boolean } = {}) {
  const { organizationId } = useOrgFilter();
  return useQuery({
    queryKey: queryKeys.facturas.byOrg(organizationId),
    queryFn: () => fetchFacturas(organizationId ?? null),
    enabled: opts.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

/**
 * P7 (v13.317.3) — Paginación server-side de la bandeja de Facturación.
 * Trae ≤`pageSize` filas por página vía RPC `facturas_listado_pagina`, con `count`
 * total para calcular `totalPages` sin descargar todo.
 */
export function useFacturasListado(opts: {
  page: number;
  pageSize: number;
  search?: string;
  estado?: string;
  clienteNombre?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  enabled?: boolean;
}) {
  const { organizationId } = useOrgFilter();
  const filtros = {
    organizationId,
    search: opts.search ?? "",
    estado: opts.estado ?? "todos",
    clienteNombre: opts.clienteNombre ?? "",
    fechaDesde: opts.fechaDesde ?? "",
    fechaHasta: opts.fechaHasta ?? "",
    page: opts.page,
    pageSize: opts.pageSize,
  };
  return useQuery({
    queryKey: queryKeys.facturas.listado(filtros),
    queryFn: () => fetchFacturasPagina({ ...filtros, organizationId: organizationId ?? null }),
    enabled: opts.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}



/** Catálogo histórico estable, independiente de filtros y página. */
export function useClientesFacturas(enabled = true) {
  const { organizationId } = useOrgFilter();
  return useQuery({
    queryKey: queryKeys.facturas.clientesListado(organizationId),
    queryFn: () => fetchClientesFacturas(organizationId ?? null),
    enabled,
  });
}

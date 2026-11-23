import { supabase } from "@/integrations/supabase/client";
import type { captureAuthOperationScope } from "@/lib/auth/authOperationScope";
import { unwrap } from "@/lib/supabase/response";
import { fromDb } from "@/lib/supabase/cast";
import type { FacturasListadoFilters, FacturasListadoResult } from "./facturasCrud";
import { facturasPaginaSchema, clientesFacturasSchema } from "./facturasPaginaSchema";

export interface FacturasPaginaFilters extends FacturasListadoFilters {
  /** Nombre histórico exacto; independiente de la búsqueda libre. */
  clienteNombre?: string;
}

export async function fetchFacturasPagina(f: FacturasPaginaFilters): Promise<FacturasListadoResult> {
  const data = await unwrap(supabase.rpc("facturas_listado_pagina", {
    p_organization_id: f.organizationId ?? undefined,
    p_search: f.search || undefined,
    p_estado: f.estado && f.estado !== "todos" ? f.estado : undefined,
    p_cliente_nombre: f.clienteNombre || undefined,
    p_fecha_desde: f.fechaDesde || undefined,
    p_fecha_hasta: f.fechaHasta || undefined,
    p_offset: (f.page ?? 0) * (f.pageSize ?? 50),
    p_limit: f.pageSize ?? 50,
  }));
  const result = fromDb(data, facturasPaginaSchema);
  return { data: result.rows, count: result.count };
}

export async function fetchFacturasParaExportar(
  filtros: Omit<FacturasPaginaFilters, "organizationId" | "page" | "pageSize">,
  scope: ReturnType<typeof captureAuthOperationScope>,
) {
  const { organizationId } = scope;
  if (!organizationId) throw new Error("Selecciona una organización para exportar facturas.");
  const pageSize = 500;
  const facturas: FacturasListadoResult["data"] = [];
  const ids = new Set<string>();
  let total: number | undefined;
  for (let page = 0; ; page++) {
    scope.assertCurrent();
    const { data, count } = await fetchFacturasPagina({ ...filtros, organizationId, page, pageSize });
    scope.assertCurrent();
    total ??= count;
    if (total !== count || data.length !== Math.min(pageSize, total - facturas.length)) {
      throw new Error("El listado cambió durante la exportación. Actualiza e inténtalo de nuevo.");
    }
    for (const factura of data) {
      if (ids.has(factura.id)) throw new Error("El orden de las facturas cambió durante la exportación.");
      ids.add(factura.id);
      facturas.push(factura);
    }
    if (facturas.length === total) return facturas;
  }
}

export async function fetchClientesFacturas(organizationId: string | null): Promise<string[]> {
  return fromDb(await unwrap(supabase.rpc("facturas_clientes_listado", {
    p_organization_id: organizationId ?? undefined,
  })), clientesFacturasSchema);
}

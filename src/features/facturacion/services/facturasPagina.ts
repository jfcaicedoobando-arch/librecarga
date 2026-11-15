import { supabase } from "@/integrations/supabase/client";
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

export async function fetchClientesFacturas(organizationId: string | null): Promise<string[]> {
  return fromDb(await unwrap(supabase.rpc("facturas_clientes_listado", {
    p_organization_id: organizationId ?? undefined,
  })), clientesFacturasSchema);
}

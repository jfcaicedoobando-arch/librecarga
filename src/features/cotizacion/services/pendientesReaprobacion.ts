/**
 * Service: conteos de cotizaciones pendientes de re-aprobación de tarifa.
 * Aislado del hook para respetar Pages→Hooks→Services→Lib.
 */
import { supabase } from "@/integrations/supabase/client";

interface ConsultaReaprobacion {
  eq(columna: string, valor: string): ConsultaReaprobacion;
}

/** Misma asignación y estado en el contador de Inicio y en el listado. */
export function filtrarMisReaprobaciones<T extends ConsultaReaprobacion>(query: T, email: string): T {
  return query.eq("estado_revalidacion", "pendiente_reaprobacion").eq("operador", email) as T;
}

export async function contarCotizacionesPendientesReaprobacion(): Promise<number> {
  const { count, error } = await supabase
    .from("cotizaciones")
    .select("id", { count: "exact", head: true })
    .eq("estado_revalidacion", "pendiente_reaprobacion")
    // v13.756.0: las cotizaciones eliminadas no deben contar como pendientes.
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function contarMisCotizacionesPendientesReaprobacion(
  email: string,
  organizationId?: string,
): Promise<number> {
  let query = supabase
    .from("cotizaciones")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { count, error } = await filtrarMisReaprobaciones(query, email);
  if (error) throw error;
  return count ?? 0;
}

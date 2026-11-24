/** Fase 6: recotizar por versión y leer costo cotizado vs real (escrituras sólo por RPC). */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { FilaCostoReal } from "./costoVsRealPricing";
import type { SolicitudPricingRow } from "./tiposPricing";

export type VersionPricingRow = Database["public"]["Tables"]["crm_pricing_opciones_versiones"]["Row"];
export const PAGINA_COSTO_REAL = 20;

export async function recotizarPricing(id: string, motivo: string): Promise<void> {
  const { error } = await supabase.rpc("crm_pricing_recotizar", { p_id: id, p_motivo: motivo });
  if (error) throw error;
}

export async function listarVersionesPricing(solicitudId: string): Promise<VersionPricingRow[]> {
  const { data, error } = await supabase.from("crm_pricing_opciones_versiones")
    .select("id, organization_id, solicitud_id, version, motivo, opciones, tarifas, respondida_at, created_by, created_at")
    .eq("solicitud_id", solicitudId).order("version", { ascending: false }).limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function leerCostoVsReal(ids: string[]): Promise<FilaCostoReal[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.rpc("crm_pricing_costo_vs_real", { p_solicitud_ids: ids });
  if (error) throw error;
  return (data ?? []) as FilaCostoReal[];
}

/** Solicitudes respondidas (base de la comparación), paginadas y filtrables. */
export async function listarSolicitudesCostoReal(pagina: number, modo: string, ejecutivo: string)
  : Promise<{ filas: SolicitudPricingRow[]; total: number }> {
  const desde = pagina * PAGINA_COSTO_REAL;
  let q = supabase.from("crm_solicitudes_pricing").select("*", { count: "exact" })
    .is("deleted_at", null).eq("estado", "respondida");
  if (modo !== "todos") q = q.eq("servicio", modo);
  if (ejecutivo !== "todos") q = q.eq("asignada_a", ejecutivo);
  const { data, error, count } = await q.order("respondida_at", { ascending: false, nullsFirst: false })
    .range(desde, desde + PAGINA_COSTO_REAL - 1);
  if (error) throw error;
  return { filas: data ?? [], total: count ?? 0 };
}

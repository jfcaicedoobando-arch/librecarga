/**
 * Escrituras de la Fase 5 de Pricing: transiciones de estado y modos por ejecutivo (sólo por RPC).
 */
import { supabase } from "@/integrations/supabase/client";
import { CAP_LISTA } from "@/constants/queryCaps";
import type { AccionFlujoPricing } from "./estadosPricing";

export async function cambiarEstadoPricing(id: string, accion: AccionFlujoPricing, motivo?: string): Promise<void> {
  const { error } = await supabase.rpc("crm_pricing_cambiar_estado", { p_id: id, p_accion: accion, p_motivo: motivo ?? undefined });
  if (error) throw error;
}

export interface ModoEjecutivo { user_id: string; modo: string }

export async function listarModosEjecutivo(): Promise<ModoEjecutivo[]> {
  const { data, error } = await supabase.from("crm_pricing_modos_ejecutivo").select("user_id, modo").limit(CAP_LISTA);
  if (error) throw error;
  return data ?? [];
}

export async function guardarModosEjecutivo(userId: string, modos: string[]): Promise<void> {
  const { error } = await supabase.rpc("crm_pricing_set_modos_ejecutivo", { p_user_id: userId, p_modos: modos });
  if (error) throw error;
}

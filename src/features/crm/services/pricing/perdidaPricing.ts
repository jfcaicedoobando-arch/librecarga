/** Motivo de pérdida de una solicitud de Pricing (escritura sólo por RPC; avisa al vendedor). */
import { supabase } from "@/integrations/supabase/client";
import type { SolicitudPricingRow } from "./tiposPricing";

export const MAXIMO_NOTA_PERDIDA = 500;

export async function marcarPerdidaPricing(id: string, motivoId: string, nota: string): Promise<void> {
  const { error } = await supabase.rpc("crm_pricing_marcar_perdida", { p_id: id, p_motivo_id: motivoId, p_nota: nota });
  if (error) throw error;
}

/** Sólo Pricing, en solicitudes respondidas (o su etiqueta Cotizada) que aún no tienen motivo. */
export function puedeMarcarPerdida(
  s: Pick<SolicitudPricingRow, "estado" | "perdida_at">, esPricing: boolean,
): boolean {
  return esPricing && !s.perdida_at && (s.estado === "respondida" || s.estado === "cotizada");
}

/**
 * Oportunidades con solicitud de Pricing respondida: al menos una respondida
 * y ninguna enviada esperando respuesta.
 */
import { supabase } from "@/integrations/supabase/client";
import { ESTADOS_EN_TRABAJO, enTrabajo } from "@/features/crm/services/pricing/estadosPricing";
import { CAP_REPORTE_AMPLIO } from "@/constants/queryCaps";

export const LLAVE_SOLICITUD_RESPONDIDA = ["crm", "pricing", "oportunidades-respondidas"] as const;

export type EstadoSolicitudOp = { oportunidad_id: string | null; estado: string };

export function oportunidadesConSolicitudRespondida(filas: EstadoSolicitudOp[]): Set<string> {
  const pendientes = new Set(filas.filter((f) => enTrabajo(f.estado)).map((f) => f.oportunidad_id));
  return new Set(filas
    .filter((f) => f.oportunidad_id && f.estado === "respondida" && !pendientes.has(f.oportunidad_id))
    .map((f) => f.oportunidad_id as string));
}

export async function fetchOportunidadesSolicitudRespondida(): Promise<Set<string>> {
  const { data, error } = await supabase.from("crm_solicitudes_pricing")
    .select("oportunidad_id, estado").is("deleted_at", null)
    .in("estado", [...ESTADOS_EN_TRABAJO, "respondida"]).not("oportunidad_id", "is", null).limit(CAP_REPORTE_AMPLIO);
  if (error) throw error;
  return oportunidadesConSolicitudRespondida(data ?? []);
}

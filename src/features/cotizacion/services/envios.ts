/**
 * Servicio de lectura del historial de envíos de cotización.
 * Aísla el cliente Supabase de los hooks (regla de capas).
 */
import { supabase } from "@/integrations/supabase/client";

export interface EnvioRow {
  id: string;
  created_at: string;
  enviado_por: string | null;
  destinatarios: Array<{ email: string; nombre?: string }>;
  cc: string[];
  asunto: string | null;
  mensaje: string | null;
  estado: string;
  error: string | null;
  pdf_link_publico: string | null;
  pdf_storage_path: string | null;
}

export async function fetchHistorialEnviosCotizacion(cotizacionId: string): Promise<EnvioRow[]> {
  const { data, error } = await supabase
    .from("cotizacion_envios")
    .select(
      "id, created_at, enviado_por, destinatarios, cc, asunto, mensaje, estado, error, pdf_link_publico, pdf_storage_path",
    )
    .eq("cotizacion_id", cotizacionId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  // SAFE-CAST: columnas jsonb (destinatarios, cc) tipadas al shape contractual de EnvioRow.
  return (data ?? []) as unknown as EnvioRow[];
}


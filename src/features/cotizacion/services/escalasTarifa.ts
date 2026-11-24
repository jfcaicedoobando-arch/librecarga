import { supabase } from "@/integrations/supabase/client";

/** Lee las escalas de la tarifa ligada; `undefined` si no hay tarifa o no es legible. */
export async function fetchEscalasTarifa(tarifaId: string | null | undefined): Promise<string[] | null | undefined> {
  if (!tarifaId) return undefined;
  const { data, error } = await supabase
    .from("costeo_tarifas").select("escalas").eq("id", tarifaId).maybeSingle();
  if (error) throw error;
  return data ? data.escalas : undefined;
}

/** Búsqueda en el catálogo IATA de aeropuertos (tabla `aeropuertos`). */
import { supabase } from "@/integrations/supabase/client";

export interface Aeropuerto { iata: string; nombre: string; ciudad: string | null; pais: string | null }

export function etiquetaAeropuerto(a: Aeropuerto): string {
  return `${a.iata} — ${a.nombre}${a.ciudad ? `, ${a.ciudad}` : ""}`;
}

export async function buscarAeropuertos(texto: string): Promise<Aeropuerto[]> {
  const q = texto.replace(/[%,()]/g, " ").trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase.from("aeropuertos")
    .select("iata, nombre, ciudad, pais")
    .or(`iata.ilike.${q}%,ciudad.ilike.%${q}%,nombre.ilike.%${q}%`)
    .order("hub_carga", { ascending: false }).order("iata").limit(30);
  if (error) throw error;
  return (data ?? []) as Aeropuerto[];
}

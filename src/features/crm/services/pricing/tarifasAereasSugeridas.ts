/** Sugerencias del tarifario aéreo para una solicitud: misma ruta IATA y vigentes. */
import { supabase } from "@/integrations/supabase/client";

export interface TarifaAereaSugerida {
  id: string; aerolinea: string | null; origen: string; destino: string;
  flete_base: number; minimo: number | null; moneda: string; vigente_hasta: string;
  tramos: { desde_kg: number; precio: number }[];
  escalas: string[] | null; transit_time_dias: number | null;
}

/** "Directo" o "Escala en LAX · ANC". */
export function textoEscalas(e: string[] | null | undefined): string {
  return e && e.length ? `Escala en ${e.join(" · ")}` : "Directo";
}

/** Código IATA desde la etiqueta "PVG — Nombre, Ciudad" (o un código suelto). */
export function iataDeEtiqueta(t: string | null | undefined): string | null {
  const m = /^\s*([A-Za-z]{3})(\s|$|—|-)/.exec(t ?? "");
  return m ? m[1].toUpperCase() : null;
}

export async function listarTarifasAereasSugeridas(
  organizationId: string, origen: string, destino: string, hoy: string,
): Promise<TarifaAereaSugerida[]> {
  const { data, error } = await supabase.from("costeo_tarifas")
    .select("id, aerolinea, aeropuerto_origen, aeropuerto_destino, flete_base, minimo, moneda, vigente_hasta, escalas, transit_time_dias, costeo_tarifa_tramos(desde_kg, precio)")
    .eq("organization_id", organizationId).eq("modo", "Aéreo")
    .eq("aeropuerto_origen", origen).eq("aeropuerto_destino", destino)
    .eq("estado", "vigente").eq("estado_aprobacion", "vigente")
    .lte("vigente_desde", hoy).gte("vigente_hasta", hoy)
    .order("flete_base").limit(20);
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id, aerolinea: t.aerolinea, origen: t.aeropuerto_origen ?? origen, destino: t.aeropuerto_destino ?? destino,
    flete_base: Number(t.flete_base ?? 0), minimo: t.minimo == null ? null : Number(t.minimo),
    moneda: t.moneda || "USD", vigente_hasta: t.vigente_hasta,
    escalas: t.escalas ?? null, transit_time_dias: t.transit_time_dias ?? null,
    tramos: (t.costeo_tarifa_tramos ?? []).map((r) => ({ desde_kg: Number(r.desde_kg), precio: Number(r.precio) }))
      .sort((a, b) => a.desde_kg - b.desde_kg),
  }));
}

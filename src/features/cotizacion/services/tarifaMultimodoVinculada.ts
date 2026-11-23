/** Lee una tarifa aérea/terrestre ligada (la vista de vigentes sólo trae marítimas). */
import { supabase } from "@/integrations/supabase/client";
import type { TarifaMultimodoCosteo } from "@/features/cotizacion/domain/fleteMultimodo";

export async function fetchTarifaMultimodoVinculada(tarifaId: string): Promise<TarifaMultimodoCosteo | null> {
  const { data, error } = await supabase
    .from("costeo_tarifas")
    .select("id, modo, flete_base, minimo, unidad_flete, moneda, aerolinea, costeo_agentes(nombre), costeo_tarifa_tramos(desde_kg, precio)")
    .eq("id", tarifaId)
    .maybeSingle();
  if (error) throw error;
  if (!data || (data.modo !== "Aéreo" && data.modo !== "Terrestre")) return null;
  // SAFE-CAST: relación embebida 1:1 a agente.
  const agente = data.costeo_agentes as unknown as { nombre?: string } | null;
  return {
    id: data.id, modo: data.modo, flete_base: Number(data.flete_base ?? 0),
    minimo: data.minimo == null ? null : Number(data.minimo),
    unidad_flete: data.unidad_flete, moneda: data.moneda,
    proveedor: data.aerolinea || agente?.nombre || "",
    tramos: (data.costeo_tarifa_tramos ?? []).map((t) => ({ desde_kg: Number(t.desde_kg), precio: Number(t.precio) })),
  };
}

/** Sugerencias del tarifario terrestre: misma submodalidad, origen/destino por CP o ciudad y unidad en FTL. */
import { supabase } from "@/integrations/supabase/client";
import type { SolicitudPricingRow } from "./tiposPricing";

export interface TarifaTerrestreSugerida {
  id: string; submodalidad: string; tipo_unidad: string | null; origen: string; destino: string;
  flete_base: number; minimo: number | null; moneda: string; vigente_hasta: string; transit_time_dias: number | null;
}

export type CriterioTerrestre = {
  submodalidad: string; origenCp: string | null; origenCiudad: string; destinoCp: string | null;
  destinoCiudad: string; tipoUnidad: string | null;
};

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** Criterio de búsqueda desde la solicitud; null si aún falta ruta o submodalidad. */
export function criterioTerrestre(s: Pick<SolicitudPricingRow, "submodalidad" | "pol" | "pod" | "origen_cp" | "destino_cp" | "tipo_unidad">): CriterioTerrestre | null {
  if (!s.submodalidad || (!s.pol?.trim() && !s.origen_cp) || (!s.pod?.trim() && !s.destino_cp)) return null;
  return { submodalidad: s.submodalidad, origenCp: s.origen_cp, origenCiudad: norm(s.pol), destinoCp: s.destino_cp,
    destinoCiudad: norm(s.pod), tipoUnidad: s.submodalidad === "FTL" ? norm(s.tipo_unidad) || null : null };
}

type FilaTarifa = { origen_cp: string | null; origen_ciudad: string | null; destino_cp: string | null; destino_ciudad: string | null; tipo_unidad: string | null };

/** Misma regla que la complejidad «baja» en la base. */
export function coincideTerrestre(t: FilaTarifa, c: CriterioTerrestre): boolean {
  const extremo = (cp: string | null, ciudad: string | null, cCp: string | null, cCiudad: string) =>
    (cCp != null && cp === cCp) || (cCiudad !== "" && norm(ciudad) === cCiudad);
  return extremo(t.origen_cp, t.origen_ciudad, c.origenCp, c.origenCiudad)
    && extremo(t.destino_cp, t.destino_ciudad, c.destinoCp, c.destinoCiudad)
    && (c.tipoUnidad == null || norm(t.tipo_unidad) === c.tipoUnidad);
}

export async function listarTarifasTerrestresSugeridas(
  organizationId: string, c: CriterioTerrestre, fecha: string,
): Promise<TarifaTerrestreSugerida[]> {
  const { data, error } = await supabase.from("costeo_tarifas")
    .select("id, submodalidad, tipo_unidad, origen_cp, origen_ciudad, destino_cp, destino_ciudad, flete_base, minimo, moneda, vigente_hasta, transit_time_dias")
    .eq("organization_id", organizationId).eq("modo", "Terrestre").eq("submodalidad", c.submodalidad)
    .eq("estado", "vigente").eq("estado_aprobacion", "vigente")
    .lte("vigente_desde", fecha).gte("vigente_hasta", fecha)
    .order("flete_base").limit(100);
  if (error) throw error;
  return (data ?? []).filter((t) => coincideTerrestre(t, c)).slice(0, 20).map((t) => ({
    id: t.id, submodalidad: t.submodalidad ?? c.submodalidad, tipo_unidad: t.tipo_unidad,
    origen: t.origen_ciudad || t.origen_cp || "", destino: t.destino_ciudad || t.destino_cp || "",
    flete_base: Number(t.flete_base ?? 0), minimo: t.minimo == null ? null : Number(t.minimo),
    moneda: t.moneda || "MXN", vigente_hasta: t.vigente_hasta, transit_time_dias: t.transit_time_dias ?? null,
  }));
}

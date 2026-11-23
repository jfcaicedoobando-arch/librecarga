/** Datos para abrir una cotización desde una tarifa aérea sugerida en Pricing. */
import { supabase } from "@/integrations/supabase/client";
import type { BanderasAereas } from "@/features/cotizacion/domain/banderasAereas";
import { pesoSolicitudAKg } from "@/features/cotizacion/domain/mapeoSolicitudCotizacion";

export interface PrefillTarifaAerea {
  tarifaId: string; moneda: "USD" | "MXN" | null; origen: string; destino: string;
  vigenteHasta: string; pesoKg: number | null; volumenM3: number | null; commodity: string | null;
  banderasAereas: BanderasAereas;
}

export async function fetchPrefillTarifaAerea(organizationId: string, tarifaId: string, solicitudId: string): Promise<PrefillTarifaAerea> {
  const [t, s] = await Promise.all([
    supabase.from("costeo_tarifas").select("id, modo, moneda, aeropuerto_origen, aeropuerto_destino, vigente_hasta, estado, estado_aprobacion")
      .eq("organization_id", organizationId).eq("id", tarifaId).maybeSingle(),
    supabase.from("crm_solicitudes_pricing").select("id, servicio, pol, pod, peso, unidad_medida, volumen_cbm, commodity, baterias_litio, known_shipper, tipo_aeronave")
      .eq("organization_id", organizationId).eq("id", solicitudId).is("deleted_at", null).maybeSingle(),
  ]);
  if (t.error) throw t.error;
  if (s.error) throw s.error;
  const tar = t.data; const sol = s.data;
  if (!tar || tar.modo !== "Aéreo" || tar.estado !== "vigente" || tar.estado_aprobacion !== "vigente") {
    throw new Error("La tarifa aérea ya no está vigente; elige otra.");
  }
  if (!sol || sol.servicio !== "Aéreo") throw new Error("La solicitud aérea ya no está disponible.");
  return {
    tarifaId: tar.id, moneda: tar.moneda === "USD" || tar.moneda === "MXN" ? tar.moneda : null,
    origen: sol.pol || tar.aeropuerto_origen || "", destino: sol.pod || tar.aeropuerto_destino || "",
    vigenteHasta: tar.vigente_hasta, pesoKg: pesoSolicitudAKg(sol.peso, sol.unidad_medida),
    volumenM3: sol.volumen_cbm == null ? null : Number(sol.volumen_cbm), commodity: sol.commodity?.trim() || null,
    banderasAereas: { baterias_litio: sol.baterias_litio, known_shipper: sol.known_shipper, tipo_aeronave: sol.tipo_aeronave },
  };
}

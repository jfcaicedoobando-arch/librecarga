/** Datos para abrir una cotización desde una tarifa aérea o terrestre sugerida en Pricing. */
import { supabase } from "@/integrations/supabase/client";
import type { BanderasAereas } from "@/features/cotizacion/domain/banderasAereas";
import { pesoSolicitudAKg } from "@/features/cotizacion/domain/mapeoSolicitudCotizacion";

export interface PrefillTarifaAerea {
  tarifaId: string; moneda: "USD" | "MXN" | null; origen: string; destino: string;
  vigenteHasta: string; pesoKg: number | null; volumenM3: number | null; commodity: string | null;
  banderasAereas: BanderasAereas;
  /** Modo de la tarifa y la solicitud (deben coincidir). */
  modo: "Aéreo" | "Terrestre";
  /** Terrestre: tipo de unidad y primera parada (sólo llenan campos vacíos). */
  tipoUnidad: string | null; puntoIntermedio: string | null;
}

function monedaDeTarifa(moneda: string | null): PrefillTarifaAerea["moneda"] {
  return moneda === "USD" || moneda === "MXN" ? moneda : null;
}

export async function fetchPrefillTarifaAerea(organizationId: string, tarifaId: string, solicitudId: string): Promise<PrefillTarifaAerea> {
  const [t, s] = await Promise.all([
    supabase.from("costeo_tarifas").select("id, modo, moneda, aeropuerto_origen, aeropuerto_destino, origen_ciudad, origen_cp, destino_ciudad, destino_cp, tipo_unidad, vigente_hasta, estado, estado_aprobacion")
      .eq("organization_id", organizationId).eq("id", tarifaId).maybeSingle(),
    supabase.from("crm_solicitudes_pricing").select("id, servicio, pol, pod, peso, unidad_medida, volumen_cbm, commodity, baterias_litio, known_shipper, tipo_aeronave, tipo_unidad, paradas")
      .eq("organization_id", organizationId).eq("id", solicitudId).is("deleted_at", null).maybeSingle(),
  ]);
  if (t.error) throw t.error;
  if (s.error) throw s.error;
  const tar = t.data; const sol = s.data;
  const modo = tar?.modo === "Aéreo" || tar?.modo === "Terrestre" ? tar.modo : null;
  if (!tar || !modo || tar.estado !== "vigente" || tar.estado_aprobacion !== "vigente") {
    throw new Error("La tarifa ya no está vigente; elige otra.");
  }
  if (!sol || sol.servicio !== modo) throw new Error("La solicitud ya no está disponible o es de otro modo.");
  const aereo = modo === "Aéreo";
  return {
    tarifaId: tar.id, moneda: monedaDeTarifa(tar.moneda), modo,
    tipoUnidad: aereo ? null : sol.tipo_unidad || tar.tipo_unidad || null,
    puntoIntermedio: aereo ? null : sol.paradas?.[0] ?? null,
    origen: sol.pol || (aereo ? tar.aeropuerto_origen : tar.origen_ciudad || tar.origen_cp) || "",
    destino: sol.pod || (aereo ? tar.aeropuerto_destino : tar.destino_ciudad || tar.destino_cp) || "",
    vigenteHasta: tar.vigente_hasta, pesoKg: pesoSolicitudAKg(sol.peso, sol.unidad_medida),
    volumenM3: sol.volumen_cbm == null ? null : Number(sol.volumen_cbm), commodity: sol.commodity?.trim() || null,
    banderasAereas: aereo
      ? { baterias_litio: sol.baterias_litio, known_shipper: sol.known_shipper, tipo_aeronave: sol.tipo_aeronave }
      : { baterias_litio: null, known_shipper: null, tipo_aeronave: null },
  };
}

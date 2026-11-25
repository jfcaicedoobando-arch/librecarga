/** Datos para abrir una cotización desde una tarifa aérea o terrestre sugerida en Pricing. */
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { BanderasAereas } from "@/features/cotizacion/domain/banderasAereas";
import { pesoSolicitudAKg } from "@/features/cotizacion/domain/mapeoSolicitudCotizacion";
import { fechaVigenciaCarga, tarifaCubreCarga } from "@/lib/date/fechaVigenciaCarga";
import { tipoAvionCotizacion } from "@/features/costeo/domain/tipoAvionTarifa";

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

function modoDeTarifa(modo: string | null | undefined): PrefillTarifaAerea["modo"] | null {
  return modo === "Aéreo" || modo === "Terrestre" ? modo : null;
}

type RutaTarifa = Pick<Tables<"costeo_tarifas">,
  "aeropuerto_origen" | "aeropuerto_destino" | "origen_ciudad" | "origen_cp" |
  "destino_ciudad" | "destino_cp" | "tipo_unidad" | "notas">;
type RutaSolicitud = Pick<Tables<"crm_solicitudes_pricing">,
  "pol" | "pod" | "tipo_unidad" | "paradas" | "baterias_litio" | "known_shipper" | "tipo_aeronave">;

function datosPorModo(modo: PrefillTarifaAerea["modo"], tarifa: RutaTarifa, solicitud: RutaSolicitud) {
  if (modo === "Aéreo") {
    return {
      origen: solicitud.pol || tarifa.aeropuerto_origen || "",
      destino: solicitud.pod || tarifa.aeropuerto_destino || "",
      tipoUnidad: null,
      puntoIntermedio: null,
      banderasAereas: {
        baterias_litio: solicitud.baterias_litio,
        known_shipper: solicitud.known_shipper,
        tipo_aeronave: tipoAvionCotizacion(tarifa.notas, solicitud.tipo_aeronave),
      },
    };
  }
  return {
    origen: solicitud.pol || tarifa.origen_ciudad || tarifa.origen_cp || "",
    destino: solicitud.pod || tarifa.destino_ciudad || tarifa.destino_cp || "",
    tipoUnidad: solicitud.tipo_unidad || tarifa.tipo_unidad || null,
    puntoIntermedio: solicitud.paradas?.[0] ?? null,
    banderasAereas: { baterias_litio: null, known_shipper: null, tipo_aeronave: null },
  };
}

export async function fetchPrefillTarifaAerea(organizationId: string, tarifaId: string, solicitudId: string): Promise<PrefillTarifaAerea> {
  const [t, s] = await Promise.all([
    supabase.from("costeo_tarifas").select("id, modo, moneda, aeropuerto_origen, aeropuerto_destino, origen_ciudad, origen_cp, destino_ciudad, destino_cp, tipo_unidad, notas, vigente_desde, vigente_hasta, estado, estado_aprobacion")
      .eq("organization_id", organizationId).eq("id", tarifaId).maybeSingle(),
    supabase.from("crm_solicitudes_pricing").select("id, servicio, pol, pod, peso, unidad_medida, volumen_cbm, commodity, baterias_litio, known_shipper, tipo_aeronave, tipo_unidad, paradas, fecha_tentativa_carga")
      .eq("organization_id", organizationId).eq("id", solicitudId).is("deleted_at", null).maybeSingle(),
  ]);
  if (t.error) throw t.error;
  if (s.error) throw s.error;
  const tar = t.data; const sol = s.data;
  const modo = modoDeTarifa(tar?.modo);
  if (!tar || !modo || tar.estado !== "vigente" || tar.estado_aprobacion !== "vigente") {
    throw new Error("La tarifa ya no está vigente; elige otra.");
  }
  if (!sol || sol.servicio !== modo) throw new Error("La solicitud ya no está disponible o es de otro modo.");
  if (!tarifaCubreCarga(tar, fechaVigenciaCarga(sol.fecha_tentativa_carga))) {
    throw new Error("La tarifa no cubre la fecha tentativa de carga; elige otra.");
  }
  return {
    tarifaId: tar.id, moneda: monedaDeTarifa(tar.moneda), modo,
    ...datosPorModo(modo, tar, sol),
    vigenteHasta: tar.vigente_hasta, pesoKg: pesoSolicitudAKg(sol.peso, sol.unidad_medida),
    volumenM3: sol.volumen_cbm == null ? null : Number(sol.volumen_cbm), commodity: sol.commodity?.trim() || null,
  };
}

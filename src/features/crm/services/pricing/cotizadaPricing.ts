import { supabase } from "@/integrations/supabase/client";
import type { SolicitudPricingRow } from "./tiposPricing";

/** Sólo presentación: no cambia el estado comercial de la cotización ni el estado SQL de Pricing. */
export async function conectarCotizadas(filas: SolicitudPricingRow[]): Promise<SolicitudPricingRow[]> {
  if (!filas.length) return filas;
  const vinculadas = new Map<string, { id: string; folio: string; created_at: string }>();
  for (const org of new Set(filas.map((s) => s.organization_id))) {
    const ids = filas.filter((s) => s.organization_id === org).map((s) => s.id);
    for (let desde = 0; ; desde += 100) {
      const { data, error } = await supabase.from("cotizaciones")
        .select("id, folio, pricing_solicitud_id, created_at")
        .eq("organization_id", org).in("pricing_solicitud_id", ids)
        .is("deleted_at", null).neq("estado", "Archivada")
        .order("created_at", { ascending: false }).order("id")
        .range(desde, desde + 99);
      if (error) throw error;
      for (const c of data ?? []) {
        if (c.pricing_solicitud_id && !vinculadas.has(c.pricing_solicitud_id)) {
          vinculadas.set(c.pricing_solicitud_id, { id: c.id, folio: c.folio, created_at: c.created_at });
        }
      }
      if ((data?.length ?? 0) < 100) break;
    }
  }
  return filas.map((s) => {
    const cotizacion = vinculadas.get(s.id);
    // Tras recotizar, sólo una cotización de la versión vigente vuelve a cerrar la solicitud.
    const deVersionVigente = cotizacion && (!s.recotizada_at || cotizacion.created_at >= s.recotizada_at);
    return cotizacion && deVersionVigente && s.estado !== "cancelada"
      ? { ...s, estado: "cotizada", cotizacion_finalizada: { id: cotizacion.id, folio: cotizacion.folio } } : s;
  });
}
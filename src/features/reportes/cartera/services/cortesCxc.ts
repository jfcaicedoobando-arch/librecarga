import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "@/lib/supabase/response";

const fila = z.object({
  id: z.string(), folio: z.string(), contraparte: z.string(), expediente: z.string(),
  moneda: z.string(), saldo: z.number(), fechaEmision: z.string(),
  fechaVencimiento: z.string().nullable(), tipoCambio: z.number().nullable().transform((n) => n ?? 0),
});
const contenido = z.object({
  filas: z.array(fila),
  tipoCambio: z.object({ fecha: z.string(), usdMxn: z.number(), eurMxn: z.number().nullable(), exacto: z.boolean() }).nullable(),
});
const corte = z.discriminatedUnion("estado", [
  z.object({ estado: z.literal("sin_corte") }),
  contenido.extend({
    estado: z.enum(["certificado", "reabierto"]), id: z.string(), fecha: z.string(),
    revision: z.number(), conciliadoEn: z.string(),
  }),
]);
const preview = contenido.extend({ fingerprint: z.string() });

export async function consultarCorteCxc(org: string, fecha: string, signal: AbortSignal) {
  return corte.parse(await unwrap(supabase.rpc("consultar_corte_cxc", { p_org: org, p_fecha: fecha }).abortSignal(signal)));
}

export function consultarAperturaCxc(org: string, signal: AbortSignal) {
  return unwrap(supabase.rpc("consultar_apertura_cxc", { p_org: org }).abortSignal(signal));
}

export function activarHistorialCxc(org: string, evidencia: string) {
  return unwrap(supabase.rpc("activar_historial_cxc", { p_org: org, p_evidencia: evidencia }));
}

export async function previsualizarCorteCxc(org: string, fecha: string, signal: AbortSignal) {
  return preview.parse(await unwrap(supabase.rpc("previsualizar_corte_cxc", { p_org: org, p_fecha: fecha }).abortSignal(signal)));
}

export function certificarCorteCxc(org: string, fecha: string, fingerprint: string, evidencia: string, id: string) {
  return unwrap(supabase.rpc("certificar_corte_cxc", {
    p_org: org, p_fecha: fecha, p_fingerprint: fingerprint, p_evidencia: evidencia, p_request_id: id,
  }));
}

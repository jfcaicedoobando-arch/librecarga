import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "@/lib/supabase/response";
import { leerTodasLasPaginas } from "@/lib/supabase/paginado";

export function historialFechaEntrega(embarque: string, signal: AbortSignal) {
  return leerTodasLasPaginas("embarque.fechaEntrega", (desde, hasta) =>
    supabase.rpc("historial_fecha_entrega", { p_embarque: embarque }).range(desde, hasta).abortSignal(signal));
}

export function solicitarFechaEntrega(embarque: string, fecha: string, motivo: string, documento: string, requestId: string) {
  return unwrap(supabase.rpc("solicitar_fecha_entrega", {
    p_embarque: embarque, p_fecha: fecha, p_motivo: motivo, p_documento: documento, p_request_id: requestId,
  }));
}

export function resolverFechaEntrega(id: string, aprobar: boolean, motivo: string) {
  return unwrap(supabase.rpc("resolver_fecha_entrega", { p_solicitud: id, p_aprobar: aprobar, p_motivo: motivo }));
}

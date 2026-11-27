/**
 * URL de «Cotizar» para una tarifa que responde una solicitud de Pricing.
 * Marítimo usa el contexto `tarifa=` (vista de tarifas marítimas vigentes);
 * aéreo y terrestre usan el prefill multimodo `tarifaAerea=`, que valida modo y vigencia.
 */
export function rutaCotizarRespuesta(tarifaId: string, solicitud: { id: string; servicio: string | null; oportunidad_id: string | null }): string {
  const multimodo = solicitud.servicio === "Aéreo" || solicitud.servicio === "Terrestre";
  const q = new URLSearchParams({ [multimodo ? "tarifaAerea" : "tarifa"]: tarifaId, solicitud: solicitud.id });
  if (solicitud.oportunidad_id) q.set("oportunidad", solicitud.oportunidad_id);
  return `/cotizaciones/nueva?${q.toString()}`;
}

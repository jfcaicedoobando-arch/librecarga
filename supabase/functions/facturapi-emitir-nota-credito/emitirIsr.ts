import type { FacturapiClientResolved } from "../_shared/facturapiClient.ts";
import { datosTimbradoConfirmado, prepararSolicitudTimbradoIsr } from "../_shared/solicitarTimbradoIsr.ts";
import { conciliarNotaCreditoIsr, leerNotaEsperada, registrarResultadoNotaIsr, type NotaIsr } from "../_shared/registrarNotaCreditoIsr.ts";
import { cuerpoTimbradoPendiente } from "../_shared/timbradoPendiente.ts";
import { buildNcPayload, type NotaCreditoContext } from "./helpers.ts";

interface Args {
  nota: NotaIsr;
  actor: string;
  updatedAt: string;
  facturapi: FacturapiClientResolved;
  ctx: NotaCreditoContext;
  json: (body: unknown, status?: number) => Response;
}

export async function emitirNotaCreditoIsr(args: Args, request: typeof fetch = fetch): Promise<Response> {
  const { nota, ctx, facturapi, json } = args;
  const solicitar = prepararSolicitudTimbradoIsr(facturapi.client);
  const { serie, ...datos } = buildNcPayload(ctx);
  const { data, error } = await nota.admin.rpc("reservar_nota_credito_isr", {
    p_nota_id: nota.notaId, p_organization_id: nota.organizationId, p_actor: args.actor, p_updated_at: args.updatedAt,
  });
  if (error) {
    const status = error.code === "23505" || error.code === "23514" ? 409 : 503;
    return json({ error: "reserva_nota_fiscal", message: "Revisa el saldo y el estado de la nota de crédito antes de timbrar." }, status);
  }
  const claim = typeof data?.claim === "string" ? data.claim : null;
  const esperado = leerNotaEsperada(data?.esperado, nota);
  if (!claim?.startsWith("PENDING:") || !esperado) {
    return json({ error: "reserva_nota_fiscal", message: "Consulta el estado de la nota de crédito." }, 503);
  }
  const intento = { ...nota, esperado, claim };

  const solicitud = await solicitar({ ...datos, ...(serie ? { series: serie } : {}) }, claim);
  if (solicitud.tipo === "sin_cfdi") {
    const estado = await registrarResultadoNotaIsr(intento, solicitud.estado, solicitud.datos);
    if (estado === "rechazado") {
      return json({ error: "facturapi_rechazo", message: "Facturapi rechazó la nota. Revisa sus datos antes de volver a timbrar." }, solicitud.httpStatus);
    }
    return json(cuerpoTimbradoPendiente({ claimTag: claim }), 202);
  }
  const { remoto } = solicitud;
  const estado = await conciliarNotaCreditoIsr(intento, remoto, facturapi.apiKey, request);
  if (estado !== "confirmado") return json(cuerpoTimbradoPendiente({ claimTag: claim }), 202);
  return json(datosTimbradoConfirmado(remoto));
}

import type { DocumentoFacturapiIsr } from "../_shared/conciliarCfdiIsr.ts";
import { FACTURAPI_BASE } from "../_shared/facturapiAuth.ts";
import { describeFacturapiError, withFacturapiTimeout, type FacturapiClientResolved } from "../_shared/facturapiClient.ts";
import { asFacturapiApi, exigirOperacion } from "../_shared/facturapiSdk.ts";
import { conciliarNotaCreditoIsr, leerNotaEsperada, registrarResultadoNotaIsr, type NotaIsr } from "../_shared/registrarNotaCreditoIsr.ts";
import { cuerpoTimbradoPendiente, esIdempotencyKeyEnUso } from "../_shared/timbradoPendiente.ts";
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
  const crear = exigirOperacion<(payload: unknown) => Promise<DocumentoFacturapiIsr>>(
    asFacturapiApi(facturapi.client), "invoices.create",
  );
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

  let remoto: DocumentoFacturapiIsr;
  try {
    remoto = await withFacturapiTimeout("invoices.create", crear({
      ...datos, ...(serie ? { series: serie } : {}), external_id: claim, idempotency_key: claim,
    }));
  } catch (fallo) {
    const { status, detail } = describeFacturapiError(fallo);
    const rechazo = [400, 401, 403, 422, 429].includes(status) && !esIdempotencyKeyEnUso(detail, status);
    const estado = await registrarResultadoNotaIsr(intento, rechazo ? "rechazado" : "pendiente", {
      http_status: status, motivo: rechazo ? "rechazo_facturapi" : "respuesta_incierta",
    });
    if (estado === "rechazado") {
      return json({ error: "facturapi_rechazo", message: "Facturapi rechazó la nota. Revisa sus datos antes de volver a timbrar." }, status);
    }
    return json(cuerpoTimbradoPendiente({ claimTag: claim }), 202);
  }
  if (!remoto) {
    await registrarResultadoNotaIsr(intento, "pendiente", { motivo: "respuesta_vacia" });
    return json(cuerpoTimbradoPendiente({ claimTag: claim }), 202);
  }
  const estado = await conciliarNotaCreditoIsr(intento, remoto, facturapi.apiKey, request);
  if (estado !== "confirmado") return json(cuerpoTimbradoPendiente({ claimTag: claim }), 202);
  const ruta = `${FACTURAPI_BASE}/invoices/${remoto.id}`;
  return json({ facturapi_id: remoto.id, uuid: remoto.uuid?.toUpperCase(),
    folio: remoto.folio_number, serie: remoto.series ?? "", pdf_url: ruta + "/pdf", xml_url: ruta + "/xml" });
}

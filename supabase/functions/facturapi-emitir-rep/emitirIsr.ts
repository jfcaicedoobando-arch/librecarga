import type { PrevalidacionRepIsr } from "../_shared/conciliarRepIsr.ts";
import type { PerfilCfdiOrigen } from "../_shared/perfilCfdiOrigen.ts";
import { datosTimbradoConfirmado, prepararSolicitudTimbradoIsr } from "../_shared/solicitarTimbradoIsr.ts";
import { conciliarYRegistrarRepIsr, registrarResultadoRepIsr, type RepIsr } from "../_shared/registrarRepIsr.ts";
import { cuerpoTimbradoPendiente } from "../_shared/timbradoPendiente.ts";
import { buildRepPayload, type FacturapiRepPayload, type PagoContext } from "./helpers.ts";
import { consultarImpuestosResumenIsr } from "./resumenIsr.ts";
import type { FacturapiResuelto } from "./casoUso.ts";
import type { JsonFn } from "./etapaResultado.ts";

interface Args {
  rep: RepIsr;
  ctx: PagoContext;
  actor: string;
  updatedAt: string;
  facturaRemota: string | null;
  origen: PerfilCfdiOrigen;
  facturapi: FacturapiResuelto;
  json: JsonFn;
}

function prevalidacionRep(ctx: PagoContext, origen: PerfilCfdiOrigen, payload: FacturapiRepPayload): PrevalidacionRepIsr {
  const [pago] = payload.complements[0].data;
  const [documento] = pago.related_documents;
  return {
    perfil: origen,
    pago: { fecha: ctx.fecha_pago.slice(0, 10), forma: pago.payment_form, moneda: pago.currency,
      monto: ctx.monto, tipo_cambio: pago.exchange ?? 1, referencia: pago.numOperacion ?? null },
    documento: { uuid: documento.uuid, moneda: documento.currency, equivalencia: documento.exchange ?? 1,
      parcialidad: documento.installment, saldo_anterior: documento.last_balance, importe_pagado: documento.amount,
      saldo_insoluto: ctx.documento_relacionado.imp_saldo_insoluto, objeto_impuesto: documento.taxability, impuestos: documento.taxes },
  };
}

export async function emitirRepIsr(args: Args, request: typeof fetch = fetch): Promise<Response> {
  const { rep, ctx, origen, facturapi, json } = args;
  const solicitar = prepararSolicitudTimbradoIsr(facturapi.client);
  const payload = buildRepPayload(ctx);
  const [documento] = payload.complements[0].data[0].related_documents;
  const resumen = await consultarImpuestosResumenIsr({ facturapi: facturapi.client, facturaId: args.facturaRemota, ctx, documento, json });
  if (resumen.response) return resumen.response;
  documento.taxes = resumen.impuestos;
  const esperado = prevalidacionRep(ctx, origen, payload);
  const { data, error } = await rep.admin.rpc("reservar_rep_isr", { p_pago_id: rep.pagoId, p_organization_id: rep.organizationId,
    p_actor: args.actor, p_updated_at: args.updatedAt, p_esperado: esperado });
  const claim = typeof data?.claim === "string" && data.claim.startsWith("PENDING:") ? data.claim : null;
  if (error || !claim) {
    const status = error?.code === "23505" || error?.code === "23514" ? 409 : 503;
    return json({ error: "reserva_rep_fiscal", message: "Revisa el saldo y las parcialidades anteriores antes de timbrar." }, status);
  }
  const intento = { ...rep, esperado, claim };
  const pendiente = () => json(cuerpoTimbradoPendiente({ claimTag: claim }), 202);

  const solicitud = await solicitar(payload, claim);
  if (solicitud.tipo === "sin_cfdi") {
    const estado = await registrarResultadoRepIsr(intento, solicitud.estado, solicitud.datos);
    return estado === "rechazado"
      ? json({ error: "facturapi_rechazo", message: "Facturapi rechazó el complemento. Revisa los datos del cobro." }, solicitud.httpStatus)
      : pendiente();
  }
  const { remoto } = solicitud;
  const estado = await conciliarYRegistrarRepIsr(intento, remoto, facturapi.apiKey, request);
  if (estado !== "confirmado") return pendiente();
  return json({ ...datosTimbradoConfirmado(remoto), folio: remoto.folio_number ?? 0 });
}

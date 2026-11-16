import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { FACTURAPI_BASE } from "../_shared/facturapiAuth.ts";
import { describeFacturapiError, withFacturapiTimeout } from "../_shared/facturapiClient.ts";
import { asFacturapiApi, exigirOperacion } from "../_shared/facturapiSdk.ts";
import { conciliarYRegistrarIsr, registrarResultadoIsr } from "../_shared/registrarEmisionIsr.ts";
import type { DocumentoFacturapiIsr } from "../_shared/conciliarCfdiIsr.ts";
import { cuerpoTimbradoPendiente, esIdempotencyKeyEnUso } from "../_shared/timbradoPendiente.ts";
import { jsonResponse } from "../_shared/response.ts";
import { buildFacturapiPayload, type FacturaContext, type FacturapiPayload } from "./helpers.ts";
import { respuestaRevision, type BorradorIsrValidado, type PrevalidacionIsr } from "./isrPreflight.ts";
import type { FacturaRow } from "./types.ts";

interface EmisionIsrArgs {
  admin: SupabaseClient;
  factura: FacturaRow;
  actorId: string;
  prevalidacion: BorradorIsrValidado;
  emisorObservado: PrevalidacionIsr["emisor"];
  ctx: FacturaContext;
  facturapi: unknown;
  apiKey: string;
}

function mismoContexto(prevalidacion: BorradorIsrValidado, ctx: FacturaContext) {
  const { receptor, datos_factura, totales } = prevalidacion.captura;
  return receptor?.rfc === ctx.receptor.tax_id && receptor.regimen_fiscal === ctx.receptor.tax_system
    && receptor.nombre === ctx.receptor.legal_name && receptor.codigo_postal === ctx.receptor.address.zip
    && datos_factura?.uso_cfdi === ctx.uso_cfdi && datos_factura.forma_pago === ctx.forma_pago
    && datos_factura.metodo_pago === ctx.metodo_pago && (datos_factura.serie ?? null) === (ctx.serie ?? null)
    && Number(datos_factura.tipo_cambio ?? 1) === ctx.tipo_cambio && totales?.moneda === ctx.moneda
    && (prevalidacion.captura.sustituye_uuid?.toUpperCase() ?? null) === (ctx.sustituye_uuid?.toUpperCase() ?? null);
}

function pendienteIsr(claim: string, conciliacion = false) {
  return jsonResponse(cuerpoTimbradoPendiente({ claimTag: claim,
    mensaje: conciliacion
      ? "El comprobante está pendiente de conciliación con la factura. Consulta el intento desde Facturación."
      : "El resultado del timbrado está pendiente. Consulta el intento desde Facturación.",
  }), 202);
}

export async function emitirFacturaConIsr(args: EmisionIsrArgs, request: typeof fetch = fetch) {
  const { admin, factura, prevalidacion } = args;
  if (!mismoContexto(prevalidacion, args.ctx)) return respuestaRevision();
  const crear = exigirOperacion<(payload: FacturapiPayload) => Promise<DocumentoFacturapiIsr>>(
    asFacturapiApi(args.facturapi), "invoices.create",
  );
  // Build and validate the payload before taking the reservation.
  const payload = buildFacturapiPayload(args.ctx);
  const { data, error } = await admin.rpc("reservar_timbrado_isr", {
    p_factura_id: factura.id, p_actor: args.actorId, p_prevalidacion: prevalidacion.captura,
    p_emisor_observado: args.emisorObservado,
  });
  if (error?.code === "23514") return respuestaRevision();
  if (error?.code === "23505") return jsonResponse({ error: "isr_intento_activo",
    message: "La factura tiene un intento pendiente. Consulta su resultado desde Facturación." }, 409);
  const claim = typeof data?.claim === "string" ? data.claim : null;
  if (error || !claim?.startsWith("PENDING:")) return jsonResponse({ error: "isr_reserva_no_disponible",
    message: "No se pudo confirmar la reserva de timbrado. Revisa el estado de la factura." }, 503);

  const intento = { admin, facturaId: factura.id, organizationId: factura.organization_id, claim };
  let remoto: DocumentoFacturapiIsr;
  try {
    remoto = await withFacturapiTimeout("invoices.create", crear({ ...payload, external_id: claim, idempotency_key: claim }));
  } catch (fallo) {
    const { status, detail } = describeFacturapiError(fallo);
    const rechazo = [400, 401, 403, 422, 429].includes(status) && !esIdempotencyKeyEnUso(detail, status);
    const respuesta = await registrarResultadoIsr(intento, rechazo ? "rechazado" : "pendiente", {
      http_status: status, motivo: rechazo ? "rechazo_facturapi" : "respuesta_incierta",
    });
    return respuesta.estado === "rechazado"
      ? jsonResponse({ error: "facturapi_rechazo", message: "Facturapi rechazó la solicitud. Revisa los datos antes de volver a timbrar." }, status)
      : pendienteIsr(claim);
  }
  if (!remoto) {
    await registrarResultadoIsr(intento, "pendiente", { motivo: "respuesta_vacia" });
    return pendienteIsr(claim);
  }
  const resultado = await conciliarYRegistrarIsr({ ...intento, esperado: prevalidacion.captura, remoto, apiKey: args.apiKey }, request);
  if (resultado.estado !== "confirmado") return pendienteIsr(claim, resultado.estado === "conciliacion");

  const ruta = `${FACTURAPI_BASE}/invoices/${remoto.id}`;
  return jsonResponse({ uuid: remoto.uuid?.toUpperCase(), folio: remoto.folio_number, serie: remoto.series ?? "",
    facturapi_id: remoto.id, pdf_url: ruta + "/pdf", xml_url: ruta + "/xml" });
}

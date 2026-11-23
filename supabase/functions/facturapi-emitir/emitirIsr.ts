import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { conciliarYRegistrarIsr, registrarResultadoIsr } from "../_shared/registrarEmisionIsr.ts";
import { datosTimbradoConfirmado, prepararSolicitudTimbradoIsr } from "../_shared/solicitarTimbradoIsr.ts";
import { cuerpoTimbradoPendiente } from "../_shared/timbradoPendiente.ts";
import { jsonResponse } from "../_shared/response.ts";
import { buildFacturapiPayload, type FacturaContext } from "./helpers.ts";
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

function mismoReceptor(esperado: BorradorIsrValidado["captura"]["receptor"], receptor: FacturaContext["receptor"]) {
  return esperado?.rfc === receptor.tax_id && esperado.regimen_fiscal === receptor.tax_system
    && esperado.nombre === receptor.legal_name && esperado.codigo_postal === receptor.address.zip;
}

function mismoUuidSustituido(esperado?: string, observado?: string | null) {
  return (esperado?.toUpperCase() ?? null) === (observado?.toUpperCase() ?? null);
}

function mismoContexto(prevalidacion: BorradorIsrValidado, ctx: FacturaContext) {
  const { receptor, datos_factura, totales } = prevalidacion.captura;
  return mismoReceptor(receptor, ctx.receptor) && datos_factura?.uso_cfdi === ctx.uso_cfdi && datos_factura.forma_pago === ctx.forma_pago
    && datos_factura.metodo_pago === ctx.metodo_pago && (datos_factura.serie ?? null) === (ctx.serie ?? null)
    && Number(datos_factura.tipo_cambio ?? 1) === ctx.tipo_cambio && totales?.moneda === ctx.moneda
    && mismoUuidSustituido(prevalidacion.captura.sustituye_uuid, ctx.sustituye_uuid);
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
  const solicitar = prepararSolicitudTimbradoIsr(args.facturapi);
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
  const solicitud = await solicitar(payload, claim);
  if (solicitud.tipo === "sin_cfdi") {
    const respuesta = await registrarResultadoIsr(intento, solicitud.estado, solicitud.datos);
    return respuesta.estado === "rechazado"
      ? jsonResponse({ error: "facturapi_rechazo", message: "Facturapi rechazó la solicitud. Revisa los datos antes de volver a timbrar." }, solicitud.httpStatus)
      : pendienteIsr(claim);
  }
  const { remoto } = solicitud;
  const resultado = await conciliarYRegistrarIsr({ ...intento, esperado: prevalidacion.captura, remoto, apiKey: args.apiKey }, request);
  if (resultado.estado !== "confirmado") return pendienteIsr(claim, resultado.estado === "conciliacion");

  return jsonResponse(datosTimbradoConfirmado(remoto));
}

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { consultarIntentoIsr, recuperarEmisionIsr } from "../recuperarEmisionIsr.ts";
import { obtenerIntentoRepIsr } from "../registrarRepIsr.ts";
import { recuperarRepConLlaveIsr, resolverLlaveRepIsr } from "../recuperarRepIsr.ts";
import { sanearPatchFactura } from "./facturaPatch.ts";
import { mapEventToFacturaPatch, mapEventToReceiptPatch, type FacturapiWebhookEvent, type MappedReceiptUpdate, type MappedUpdate } from "./helpers.ts";
import { COLS_FACTURA, COLS_REP, claimEsPendiente, externalIdDeEvento, localizarFila, patchAdopcionPendiente, type FilaLocalizada } from "./pendiente.ts";

interface VersionLocal {
  id: string;
  updated_at: string;
}

interface FacturaLocal extends VersionLocal {
  estado: string | null;
  sustituida_por: string | null;
  cancellation_status: string | null;
  uuid_fiscal: string | null;
  facturapi_id: string | null;
  evaluacion_fiscal?: unknown;
  ambiente?: string | null;
}

interface PagoLocal extends VersionLocal {
  estado_rep: string | null;
  rep_cancellation_status: string | null;
  facturapi_rep_id: string | null;
  uuid_rep: string | null;
  ambiente: string | null;
}

export type ResultadoWebhook =
  | {
    estado: "aplicar";
    tabla: "facturas" | "pagos_factura";
    id: string;
    version: string;
    claim: string | null;
    patch: Record<string, unknown>;
    accion: string;
  }
  | { estado: "conciliado_isr"; id: string; claim: string }
  | { estado: "conciliado_rep_isr"; id: string; claim: string }
  | { estado: "ignorar"; motivo: "evento_sin_efecto" | "estado_ya_avanzado" | "timbrado_pendiente" }
  | { estado: "reintentar"; motivo: "factura_not_found" | "pago_not_found" | "timbrado_isr_pendiente" };

async function conciliarRepWebhookIsr(
  supabase: SupabaseClient, orgId: string, pagoId: string, claim: string,
  { ambienteFirma, receipt }: { ambienteFirma: FacturapiWebhookEvent["ambiente_firma"]; receipt: MappedReceiptUpdate },
): Promise<ResultadoWebhook | null> {
  const guardado = await obtenerIntentoRepIsr({ admin: supabase, pagoId, organizationId: orgId }, claim);
  if (guardado.tipo === "legacy") return null;
  if (guardado.tipo !== "vigente") return { estado: "reintentar", motivo: "timbrado_isr_pendiente" };
  const { intento } = guardado;
  const ambiente = intento.esperado.perfil.ambiente;
  if (ambienteFirma !== ambiente || receipt.patch.estado_rep !== "Timbrado") {
    return { estado: "ignorar", motivo: "evento_sin_efecto" };
  }
  if (guardado.facturapiId && guardado.facturapiId !== receipt.facturapi_rep_id) {
    return { estado: "ignorar", motivo: "evento_sin_efecto" };
  }
  const llave = await resolverLlaveRepIsr(intento);
  const remoto = llave ? await recuperarRepConLlaveIsr(intento, receipt.facturapi_rep_id, llave) : null;
  return remoto ? { estado: "conciliado_rep_isr", id: pagoId, claim } : { estado: "reintentar", motivo: "timbrado_isr_pendiente" };
}

async function prepararPago(
  supabase: SupabaseClient, orgId: string, event: FacturapiWebhookEvent, receipt: MappedReceiptUpdate,
): Promise<ResultadoWebhook> {
  const localizado = await localizarFila<PagoLocal>({
    supabase, tabla: "pagos_factura", orgId, cols: COLS_REP,
    select: "id, updated_at, estado_rep, rep_cancellation_status, facturapi_rep_id, uuid_rep, ambiente",
    remoteId: receipt.facturapi_rep_id, externalId: externalIdDeEvento(event),
  });
  if (!localizado) return { estado: "reintentar", motivo: "pago_not_found" };
  const pago = localizado.fila;
  if (localizado.via === "pendiente" && localizado.claimActual) {
    const conciliado = await conciliarRepWebhookIsr(supabase, orgId, pago.id, localizado.claimActual, { ambienteFirma: event.ambiente_firma, receipt });
    if (conciliado) return conciliado;
  }
  if (firmaDeOtroAmbiente(event.ambiente_firma, pago.ambiente)) return { estado: "ignorar", motivo: "evento_sin_efecto" };

  const patch = { ...receipt.patch };
  if (pago.estado_rep === "Timbrado" && pago.uuid_rep && patch.estado_rep === "Timbrado") {
    return { estado: "ignorar", motivo: "estado_ya_avanzado" };
  }
  if (pago.estado_rep === "Cancelado" && patch.estado_rep === "Timbrado") {
    delete patch.estado_rep;
    delete patch.timbrado_rep_en;
  }
  if (pago.rep_cancellation_status === "accepted" && patch.rep_cancellation_status !== "accepted") {
    delete patch.rep_cancellation_status;
  }
  if (Object.keys(patch).length === 0) return { estado: "ignorar", motivo: "estado_ya_avanzado" };

  if (localizado.via === "pendiente") {
    const adopcion = patchAdopcionPendiente(COLS_REP, receipt.facturapi_rep_id, patch);
    if (!adopcion) return { estado: "ignorar", motivo: "timbrado_pendiente" };
    Object.assign(patch, adopcion);
  }
  return {
    estado: "aplicar", tabla: "pagos_factura", id: pago.id, version: pago.updated_at,
    claim: localizado.claimActual, patch, accion: receipt.bitacora_accion,
  };
}

async function conciliarFacturaWebhookIsr(
  supabase: SupabaseClient, organizationId: string, facturaId: string, claim: string,
  { remoteId, ambienteFirma }: { remoteId: string; ambienteFirma: FacturapiWebhookEvent["ambiente_firma"] },
): Promise<ResultadoWebhook> {
  const intento = await consultarIntentoIsr({ admin: supabase, organizationId, facturaId, claim });
  if (intento && firmaDeOtroAmbiente(ambienteFirma, intento.ambiente)) {
    return { estado: "ignorar", motivo: "evento_sin_efecto" };
  }
  const resultado = intento ? await recuperarEmisionIsr(intento, remoteId) : null;
  return resultado?.estado === "confirmado"
    ? { estado: "conciliado_isr", id: facturaId, claim }
    : { estado: "reintentar", motivo: "timbrado_isr_pendiente" };
}

function firmaDeOtroAmbiente(ambienteFirma: FacturapiWebhookEvent["ambiente_firma"], ambiente: string | null | undefined) {
  return ambiente != null && (ambienteFirma === "sandbox" || ambienteFirma === "live") && ambienteFirma !== ambiente;
}

async function prepararFactura(
  supabase: SupabaseClient, orgId: string, event: FacturapiWebhookEvent,
  conciliarIsr: typeof conciliarFacturaWebhookIsr,
): Promise<ResultadoWebhook> {
  const mapped = mapEventToFacturaPatch(event);
  const remoteId = mapped?.facturapi_id ?? (event.type === "invoice.status_updated" ? event.data?.object?.id : null);
  if (typeof remoteId !== "string" || !remoteId) return { estado: "ignorar", motivo: "evento_sin_efecto" };
  const localizada = await localizarFila<FacturaLocal>({
    supabase, tabla: "facturas", orgId, cols: COLS_FACTURA,
    select: "id, updated_at, estado, sustituida_por, cancellation_status, facturapi_id, uuid_fiscal, evaluacion_fiscal, ambiente",
    remoteId, externalId: externalIdDeEvento(event),
  });
  if (!localizada) return { estado: "reintentar", motivo: "factura_not_found" };
  const factura = localizada.fila;
  const claim = localizada.claimActual;
  if (factura.evaluacion_fiscal != null && claim && claimEsPendiente(claim)) {
    if (event.type !== "invoice.status_updated") return { estado: "ignorar", motivo: "timbrado_pendiente" };
    return conciliarIsr(supabase, orgId, factura.id, claim, { remoteId, ambienteFirma: event.ambiente_firma });
  }
  if (!mapped) return { estado: "ignorar", motivo: "evento_sin_efecto" };
  return prepararActualizacionFactura(localizada, mapped, event.ambiente_firma);
}

function prepararActualizacionFactura(localizada: FilaLocalizada<FacturaLocal>, mapped: MappedUpdate,
  ambienteFirma: FacturapiWebhookEvent["ambiente_firma"]): ResultadoWebhook {
  const factura = localizada.fila;
  if (factura.evaluacion_fiscal != null
    && (mapped.patch.estado === "Emitida" || firmaDeOtroAmbiente(ambienteFirma, factura.ambiente))) {
    return { estado: "ignorar", motivo: "estado_ya_avanzado" };
  }
  const patch = sanearPatchFactura(mapped, factura);
  if (factura.evaluacion_fiscal != null) {
    delete patch.uuid_fiscal;
    if (Object.keys(patch).length === 0) return { estado: "ignorar", motivo: "estado_ya_avanzado" };
  }

  if (localizada.via === "pendiente") {
    const adopcion = patchAdopcionPendiente(COLS_FACTURA, mapped.facturapi_id, patch);
    if (adopcion) Object.assign(patch, adopcion);
    else if (patch.cancellation_status !== "accepted") return { estado: "ignorar", motivo: "timbrado_pendiente" };
  }
  return {
    estado: "aplicar", tabla: "facturas", id: factura.id, version: factura.updated_at,
    claim: localizada.claimActual, patch, accion: mapped.bitacora_accion,
  };
}

/** Los avisos de cancelación de REP a veces llegan como `invoice.*`. */
export async function despacharEvento(
  supabase: SupabaseClient, orgId: string, event: FacturapiWebhookEvent,
  conciliarIsr = conciliarFacturaWebhookIsr,
): Promise<ResultadoWebhook> {
  const receipt = mapEventToReceiptPatch(event);
  if (receipt && event.type.startsWith("receipt.")) return prepararPago(supabase, orgId, event, receipt);
  const factura = await prepararFactura(supabase, orgId, event, conciliarIsr);
  if (!receipt || factura.estado !== "reintentar" || factura.motivo !== "factura_not_found") return factura;
  return prepararPago(supabase, orgId, event, receipt);
}

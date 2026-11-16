/**
 * Ramificación del resultado de `invoices.cancel` para un REP.
 *
 * Extraído de `index.ts` (v13.823.1) para respetar el límite de 200 líneas por
 * función del lint: la lógica es la misma que antes, sin cambios de contrato.
 * Nunca se marca `estado_rep='Cancelado'` si el SAT dejó la cancelación
 * pendiente o el receptor la rechazó en su Buzón Tributario.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { registrarBitacoraEdge } from "../_shared/bitacora.ts";

export interface FapiCancelResponse { status?: string; cancellation_status?: string }

export interface ResultadoCancelacionArgs {
  supabase: SupabaseClient;
  json: (body: unknown, status?: number) => Response;
  pagoId: string;
  facturapiId: string;
  organizationId: string;
  usuarioId: string;
  usuarioEmail?: string;
  motivo: string;
  sustituyeUuid?: string;
  cancelResp: FapiCancelResponse;
}

export async function resolverResultadoCancelacionRep(args: ResultadoCancelacionArgs): Promise<Response> {
  const { supabase, json, pagoId, organizationId, usuarioId, usuarioEmail, motivo, cancelResp } = args;
  const cancellationStatus = (cancelResp.cancellation_status ?? "none").toLowerCase();
  const invoiceStatus = (cancelResp.status ?? "").toLowerCase();
  const bitacoraBase = { organizationId, usuarioId, usuarioEmail, modulo: "facturacion" as const };
  const actualizar = (patch: Record<string, unknown>) => supabase.from("pagos_factura").update(patch)
    .eq("id", pagoId).eq("organization_id", organizationId).eq("facturapi_rep_id", args.facturapiId)
    .is("deleted_at", null).select("id").maybeSingle();

  if (cancellationStatus === "rejected" || cancellationStatus === "expired") {
    const resultado = await actualizar({ rep_cancellation_status: cancellationStatus });
    if (resultado.error || !resultado.data) return json({ error: "db_update_failed" }, 409);
    await registrarBitacoraEdge(supabase, {
      ...bitacoraBase,
      accion: "facturapi_rep_cancelacion_rechazada",
      entidadId: pagoId,
      detalles: { cancellation_status: cancellationStatus, motivo },
    });
    return json({
      ok: false,
      cancellation_status: cancellationStatus,
      message: cancellationStatus === "expired"
        ? "El plazo de 72 h expiró sin respuesta del receptor. Reintenta la solicitud."
        : "El receptor rechazó la cancelación del REP desde su Buzón Tributario.",
    }, 409);
  }

  if (cancellationStatus === "pending" || cancellationStatus === "verifying") {
    const { error: pendErr, data } = await actualizar({ rep_cancellation_status: cancellationStatus, rep_motivo_cancel: motivo });
    if (pendErr) return json({ error: "db_update_failed", detail: pendErr.message }, 500);
    if (!data) return json({ error: "rep_actualizado" }, 409);
    await registrarBitacoraEdge(supabase, {
      ...bitacoraBase,
      accion: "facturapi_rep_cancelacion_solicitada",
      entidadId: pagoId,
      detalles: { motivo, cancellation_status: cancellationStatus },
    });
    return json({
      ok: true,
      pending: true,
      cancellation_status: cancellationStatus,
      message: "Cancelación del REP enviada al SAT. El receptor tiene hasta 72 h hábiles para aceptar o rechazar (silencio positivo).",
    });
  }

  const esAceptada = cancellationStatus === "accepted" || (invoiceStatus === "canceled" && cancellationStatus === "none");
  if (!esAceptada) {
    await registrarBitacoraEdge(supabase, {
      ...bitacoraBase,
      accion: "facturapi_rep_cancelacion_estado_desconocido",
      entidadId: pagoId,
      detalles: { cancellation_status: cancellationStatus, invoice_status: invoiceStatus },
    });
    return json({
      ok: false,
      cancellation_status: cancellationStatus,
      message: `FacturApi devolvió un estado inesperado: ${cancellationStatus || invoiceStatus}.`,
    }, 502);
  }

  const { error: updErr, data } = await actualizar({
      estado_rep: "Cancelado",
      rep_cancellation_status: "accepted",
      rep_cancelado_en: new Date().toISOString(),
      rep_motivo_cancel: motivo,
    });
  if (updErr) return json({ error: "db_update_failed", detail: updErr.message }, 500);
  if (!data) return json({ error: "rep_actualizado" }, 409);

  await registrarBitacoraEdge(supabase, {
    ...bitacoraBase,
    accion: "facturapi_rep_cancelado",
    entidadId: pagoId,
    detalles: { motivo, sustituye_uuid: args.sustituyeUuid ?? null, cancellation_status: "accepted" },
  });

  return json({ ok: true, status: cancelResp.status ?? "canceled", cancellation_status: "accepted" });
}

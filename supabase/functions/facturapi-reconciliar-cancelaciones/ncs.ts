/**
 * EF-03: barrido de notas de crédito (`factura_notas_credito`) del cron de
 * reconciliación. Extraído de `index.ts` (P1-3b) para mantener los archivos
 * bajo el límite de líneas; la lógica es la misma que tenía ahí.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { captureEdgeException } from "../_shared/sentry.ts";
import { registrarBitacoraEdge } from "../_shared/bitacora.ts";
import { consultarCancelacion, type ReconcileCtx } from "./ejecutar.ts";
import { marcarRevisado } from "./cursor.ts";
import {
  acumularOutcome,
  descargarAcuse,
  resolveNextActionNc,
  type NotaCreditoPendiente,
} from "./reconcile.ts";

async function actualizarNc(supabase: SupabaseClient, nc: NotaCreditoPendiente, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from("factura_notas_credito").update(patch)
    .eq("id", nc.id).eq("organization_id", nc.organization_id).eq("facturapi_id", nc.facturapi_id)
    .eq("cancellation_status", nc.cancellation_status).is("deleted_at", null).select("id").maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** EF-03: cierra una NC cuya cancelación el SAT aceptó asíncronamente (acuse + bitácora). */
async function applyAcceptedNc(
  supabase: SupabaseClient,
  nc: NotaCreditoPendiente,
  patchBase: Record<string, unknown>,
  apiKey: string,
  orgId: string,
): Promise<boolean> {
  const acuse = await descargarAcuse(nc.facturapi_id, apiKey);
  const patch = {
    ...patchBase,
    acuse_cancelacion_xml: acuse.xml,
    acuse_cancelacion_fecha: acuse.xml ? new Date().toISOString() : null,
    acuse_cancelacion_status: acuse.status,
  };
  if (!await actualizarNc(supabase, nc, patch)) return false;

  await registrarBitacoraEdge(supabase, {
    organizationId: orgId,
    usuarioId: null,
    modulo: "facturacion",
    accion: "facturapi_nc_cancelada_async",
    entidadId: nc.id,
    detalles: { via: "cron_reconciliacion", cancellation_status: "accepted" },
  });
  return true;
}

/** EF-03: espejo de reconcileOne para factura_notas_credito. */
export async function reconcileOneNc(ctx: ReconcileCtx, nc: NotaCreditoPendiente): Promise<void> {
  const { supabase, resumen } = ctx;
  resumen.revisadas++;
  try {
    return await reconcileOneNcInner(ctx, nc);
  } finally {
    // P1-3: el cursor sólo se marca en documentos realmente INICIADOS — los
    // diferidos por presupuesto no llegan aquí y conservan su prioridad.
    await marcarRevisado(supabase, "factura_notas_credito", "reconciliacion_checked_at", nc.id, new Date().toISOString());
  }
}

async function reconcileOneNcInner(ctx: ReconcileCtx, nc: NotaCreditoPendiente): Promise<void> {
  const { supabase, apiKey, orgId, resumen } = ctx;
  try {
    const remote = await consultarCancelacion(ctx, nc.facturapi_id);
    const decision = resolveNextActionNc(remote, nc, new Date().toISOString());

    if (decision.outcome === "no_change") {
      resumen.sin_cambio++;
      return;
    }

    if (decision.outcome === "accepted") {
      const ok = await applyAcceptedNc(supabase, nc, decision.patch, apiKey, orgId);
      if (!ok) { resumen.sin_cambio++; return; }
      resumen.aceptadas++;
      return;
    }

    // rejected / expired / transition
    if (!await actualizarNc(supabase, nc, decision.patch)) { resumen.sin_cambio++; return; }
    if (decision.outcome === "rejected" || decision.outcome === "expired") {
      await registrarBitacoraEdge(supabase, {
        organizationId: orgId,
        usuarioId: null,
        modulo: "facturacion",
        accion: "facturapi_nc_cancelacion_no_aceptada",
        entidadId: nc.id,
        detalles: { via: "cron_reconciliacion", cancellation_status: decision.outcome },
      });
    }
    acumularOutcome(resumen, decision.outcome);
  } catch (_err) {
    resumen.errores++;
    // EF-12: no tragar el error — sin id un fallo sistemático (API key rotada,
    // red) sólo movía un contador invisible.
    console.error("[reconciliar-cancelaciones] error", {
      entidad: "nc",
      id: nc.id,
      error: _err instanceof Error ? _err.message : String(_err),
    });
    await captureEdgeException(_err, {
      fn: "facturapi-reconciliar-cancelaciones",
      organization_id: orgId,
      extra: { nota_credito_id: nc.id, facturapi_id: nc.facturapi_id },
    });
  }
}

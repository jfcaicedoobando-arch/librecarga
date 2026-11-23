/**
 * P1-3b: ejecutor del plan de reconciliación con presupuesto de wall-time.
 *
 * Recorre el plan intercalado (`planificarTareas`) y, ANTES de iniciar cada
 * documento, comprueba el presupuesto. Si ya se agotó, deja los documentos no
 * iniciados intactos (cursor sin tocar) y los cuenta como `diferidos` — no como
 * errores. La corrida termina limpia, responde y suelta el lock de cron.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import type { FacturaPendiente, FapiInvoiceStatus, NotaCreditoPendiente, RepPendiente, Resumen } from "./reconcile.ts";
import { nuevoResumen } from "./reconcile.ts";
import type { FacturapiAmbiente } from "../_shared/facturapiAuth.ts";
import { withFacturapiTimeout } from "../_shared/facturapiClient.ts";
import type { Tarea } from "./plan.ts";
import { CRON_RETRIEVE_TIMEOUT_MS, type Presupuesto } from "./presupuesto.ts";

export interface RetrieveClient {
  invoices: { retrieve: (id: string) => Promise<unknown> };
}

export interface ReconcileCtx {
  supabase: SupabaseClient;
  facturapi: RetrieveClient;
  apiKey: string;
  ambiente: FacturapiAmbiente;
  orgId: string;
  resumen: Resumen;
}

export type ClienteResuelto =
  | { ok: true; client: RetrieveClient; apiKey: string; ambiente: FacturapiAmbiente }
  | { ok: false };

export interface EjecutarDeps {
  supabase: SupabaseClient;
  presupuesto: Presupuesto;
  resolverCliente: (orgId: string, ambiente?: FacturapiAmbiente) => Promise<ClienteResuelto>;
  procesar: {
    factura: (ctx: ReconcileCtx, doc: FacturaPendiente) => Promise<void>;
    nc: (ctx: ReconcileCtx, doc: NotaCreditoPendiente) => Promise<void>;
    rep: (ctx: ReconcileCtx, doc: RepPendiente) => Promise<void>;
  };
}

async function despachar(ctx: ReconcileCtx, tarea: Tarea, deps: EjecutarDeps): Promise<void> {
  if (tarea.familia === "factura") return await deps.procesar.factura(ctx, tarea.doc);
  if (tarea.familia === "nc") return await deps.procesar.nc(ctx, tarea.doc);
  return await deps.procesar.rep(ctx, tarea.doc);
}

/** Agrupa consultas por organización y ambiente, incluso si cambió el ambiente activo. */
function memoResolver(deps: EjecutarDeps): EjecutarDeps["resolverCliente"] {
  const cache = new Map<string, ClienteResuelto>();
  return async (orgId, ambiente) => {
    const clave = `${orgId}:${ambiente ?? "activo"}`;
    const hit = cache.get(clave);
    if (hit) return hit;
    const resuelto = await deps.resolverCliente(orgId, ambiente);
    cache.set(clave, resuelto);
    return resuelto;
  };
}

export async function consultarCancelacion(ctx: Pick<ReconcileCtx, "facturapi" | "ambiente">, facturapiId: string): Promise<FapiInvoiceStatus> {
  const remote = await withFacturapiTimeout("invoices.retrieve", ctx.facturapi.invoices.retrieve(facturapiId), CRON_RETRIEVE_TIMEOUT_MS) as
    (FapiInvoiceStatus & { id?: string; livemode?: boolean }) | null;
  if (remote?.id !== facturapiId || remote.livemode !== (ctx.ambiente === "live")) {
    throw new Error("Respuesta de cancelación de otro CFDI o ambiente");
  }
  return remote;
}

export async function ejecutarPlan(tareas: Tarea[], deps: EjecutarDeps): Promise<Resumen> {
  const resumen = nuevoResumen();
  const resolver = memoResolver(deps);

  for (let i = 0; i < tareas.length; i++) {
    // Corte por presupuesto: los pendientes de este punto en adelante quedan
    // intactos para la próxima corrida (mismo orden justo).
    if (deps.presupuesto.agotado()) {
      resumen.diferidos = tareas.length - i;
      break;
    }
    const tarea = tareas[i];
    try {
      const ambiente = tarea.doc.ambiente ?? undefined;
      const cliente = await resolver(tarea.orgId, ambiente);
      if (!cliente.ok || (ambiente && cliente.ambiente !== ambiente)) {
        resumen.errores++;
        continue;
      }
      await despachar({ supabase: deps.supabase, facturapi: cliente.client, apiKey: cliente.apiKey,
        ambiente: cliente.ambiente, orgId: tarea.orgId, resumen }, tarea, deps);
    } catch (err) {
      // Blindaje: un fallo inesperado de un documento no debe abortar la
      // corrida (el lock se libera en el `finally` del handler).
      resumen.errores++;
      console.error("[reconciliar-cancelaciones] tarea fallida", {
        familia: tarea.familia,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return resumen;
}

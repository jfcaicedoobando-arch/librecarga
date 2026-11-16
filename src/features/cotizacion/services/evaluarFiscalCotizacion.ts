import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { captureAuthDataScope } from "@/lib/auth/authOperationScope";
import { unwrap } from "@/lib/supabase/response";
import { leerSnapshotFiscalCotizacion } from "../domain/snapshotFiscalCotizacion";

export async function evaluarFiscalCotizacion(
  params: {
    organizationId: string;
    clienteId: string | null;
    cotizacionId: string | null;
    conceptos: Json;
    signal: AbortSignal;
    scope: ReturnType<typeof captureAuthDataScope>;
  },
) {
  params.scope.assertCurrent();
  const datos = await unwrap(supabase.rpc("evaluar_documento_isr_resico", {
    p_org_id: params.organizationId,
    // SAFE-CAST: la RPC acepta NULL (prospecto sin cliente); los tipos generados no lo reflejan.
    p_cliente_id: params.clienteId as string,
    p_conceptos: params.conceptos,
    p_cotizacion_id: params.cotizacionId ?? undefined,
  }).abortSignal(params.signal));
  params.scope.assertCurrent();

  if (datos == null || typeof datos !== "object" || !("snapshot" in datos)) {
    return { estado: "invalido" } as const;
  }
  const fiscal = leerSnapshotFiscalCotizacion(datos.snapshot);
  if ("organization_id" in fiscal && (fiscal.organization_id !== params.organizationId || fiscal.cliente_id !== params.clienteId)) {
    return { estado: "invalido" } as const;
  }
  return fiscal;
}

export async function revisarFiscalCotizacion({ cotizacionId, fingerprint, motivo }: {
  cotizacionId: string;
  fingerprint: string;
  motivo: string;
}) {
  const scope = captureAuthDataScope();
  scope.assertCurrent();
  const resultado = await unwrap(supabase.rpc("revisar_cotizacion_fiscal", {
    p_cotizacion_id: cotizacionId, p_expected_fingerprint: fingerprint, p_motivo: motivo,
  }));
  scope.assertCurrent();
  return resultado;
}

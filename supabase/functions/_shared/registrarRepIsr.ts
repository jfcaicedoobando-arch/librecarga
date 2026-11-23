import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import type { DocumentoFacturapiIsr } from "./conciliarCfdiIsr.ts";
import type { PrevalidacionRepIsr } from "./conciliarRepIsr.ts";
import { obtenerEvidenciaRepIsr } from "./evidenciaRepIsr.ts";

export interface RepIsr { admin: SupabaseClient; pagoId: string; organizationId: string }
export interface IntentoRepIsr extends RepIsr { claim: string; esperado: PrevalidacionRepIsr }

export async function obtenerIntentoRepIsr(rep: RepIsr, claim: string) {
  const { data, error } = await rep.admin.rpc("obtener_intento_rep_isr", {
    p_pago_id: rep.pagoId, p_organization_id: rep.organizationId, p_claim: claim,
  });
  if (!error && data?.protegido === false) return { tipo: "legacy" } as const;
  const esperado = data?.esperado as Partial<PrevalidacionRepIsr> | null;
  if (error || !esperado?.perfil || !esperado.pago || !esperado.documento
    || typeof esperado.perfil.emisor?.facturapiOrgId !== "string" || !esperado.perfil.receptor
    || !["sandbox", "live"].includes(esperado.perfil.ambiente) || !Array.isArray(esperado.documento.impuestos)) {
    return { tipo: "pendiente" } as const;
  }
  return { tipo: "vigente", intento: { ...rep, claim, esperado: esperado as PrevalidacionRepIsr },
    facturapiId: typeof data.facturapi_id === "string" ? data.facturapi_id : null } as const;
}

export async function registrarResultadoRepIsr(
  intento: IntentoRepIsr, estado: "pendiente" | "conciliacion" | "rechazado" | "confirmado", resultado: Record<string, unknown>,
) {
  const { admin, pagoId, organizationId, claim } = intento;
  const { data, error } = await admin.rpc("registrar_resultado_rep_isr", {
    p_pago_id: pagoId, p_organization_id: organizationId, p_claim: claim, p_estado: estado, p_resultado: resultado,
  });
  return error || data?.estado == null ? "error" : String(data.estado);
}

export async function conciliarYRegistrarRepIsr(
  intento: IntentoRepIsr, remoto: DocumentoFacturapiIsr, apiKey: string, request: typeof fetch = fetch,
) {
  const evidencia = await obtenerEvidenciaRepIsr({ ...intento, remoto, apiKey }, request);
  return registrarResultadoRepIsr(intento, evidencia.estado, evidencia.datos);
}

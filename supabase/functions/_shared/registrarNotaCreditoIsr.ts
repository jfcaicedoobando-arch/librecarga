import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import type { DocumentoFacturapiIsr, PrevalidacionTimbradoIsr } from "./conciliarCfdiIsr.ts";
import { obtenerEvidenciaCfdiIsr } from "./registrarEmisionIsr.ts";

export interface NotaIsr {
  admin: SupabaseClient;
  notaId: string;
  organizationId: string;
}

export interface IntentoNotaIsr extends NotaIsr {
  claim: string;
  esperado: PrevalidacionTimbradoIsr;
}

export function leerNotaEsperada(datos: unknown, nota: NotaIsr): PrevalidacionTimbradoIsr | null {
  if (!datos || typeof datos !== "object") return null;
  const esperado = datos as Partial<PrevalidacionTimbradoIsr> & { nota_id?: string; organization_id?: string };
  if (esperado.tipo !== "E" || esperado.nota_id !== nota.notaId || esperado.organization_id !== nota.organizationId
    || (esperado.ambiente !== "sandbox" && esperado.ambiente !== "live")
    || typeof esperado.emisor?.facturapi_org_id !== "string" || !esperado.receptor || !esperado.datos_factura
    || !esperado.totales || typeof esperado.factura_uuid !== "string") return null;
  return esperado as PrevalidacionTimbradoIsr;
}

export async function obtenerIntentoNotaIsr(nota: NotaIsr, claim: string) {
  const { data, error } = await nota.admin.rpc("obtener_intento_nota_credito_isr", {
    p_nota_id: nota.notaId, p_organization_id: nota.organizationId, p_claim: claim,
  });
  if (error || data?.protegido === undefined) return { tipo: "pendiente" } as const;
  if (data.protegido === false) return { tipo: "legacy" } as const;
  const esperado = leerNotaEsperada(data.esperado, nota);
  if (!esperado) return { tipo: "pendiente" } as const;
  return { tipo: "vigente", intento: { ...nota, claim, esperado }, facturapiId: data.facturapi_id as string | null } as const;
}

export async function registrarResultadoNotaIsr(
  intento: IntentoNotaIsr, estado: "pendiente" | "conciliacion" | "rechazado" | "confirmado",
  resultado: Record<string, unknown>,
) {
  const { admin, notaId, organizationId, claim } = intento;
  const { data, error } = await admin.rpc("registrar_resultado_nota_credito_isr", {
    p_nota_id: notaId, p_organization_id: organizationId, p_claim: claim, p_estado: estado, p_resultado: resultado,
  });
  return error || data == null ? "error" : String(data.estado);
}

export async function conciliarNotaCreditoIsr(
  intento: IntentoNotaIsr, remoto: DocumentoFacturapiIsr, apiKey: string, request: typeof fetch = fetch,
) {
  const evidencia = await obtenerEvidenciaCfdiIsr({ ...intento, remoto, apiKey }, "notas-credito", request);
  return registrarResultadoNotaIsr(intento, evidencia.estado, evidencia.datos);
}

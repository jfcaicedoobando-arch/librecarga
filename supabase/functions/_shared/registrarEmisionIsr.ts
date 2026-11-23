import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import {
  conciliarCfdiIsr,
  type DocumentoFacturapiIsr,
  type PrevalidacionTimbradoIsr,
} from "./conciliarCfdiIsr.ts";
import { obtenerEvidenciaTimbradoIsr } from "./evidenciaTimbradoIsr.ts";

export interface EmisionIsr {
  admin: SupabaseClient;
  facturaId: string;
  organizationId: string;
  claim: string;
}

export async function obtenerIntentoIsr(intento: EmisionIsr): Promise<{
  esperado: PrevalidacionTimbradoIsr;
  facturapiId: string | null;
} | null> {
  const { data, error } = await intento.admin.rpc("obtener_intento_timbrado_isr", {
    p_factura_id: intento.facturaId, p_organization_id: intento.organizationId, p_claim: intento.claim,
  });
  if (error || data?.prevalidacion == null) return null;
  const esperado = data.prevalidacion;
  if (esperado.factura_id !== intento.facturaId || esperado.organization_id !== intento.organizationId
    || (esperado.ambiente !== "sandbox" && esperado.ambiente !== "live")
    || typeof esperado.emisor?.facturapi_org_id !== "string") return null;
  return { esperado: esperado as PrevalidacionTimbradoIsr, facturapiId: data.facturapi_id ?? null };
}

export async function registrarResultadoIsr(
  intento: EmisionIsr,
  estado: "pendiente" | "conciliacion" | "rechazado" | "confirmado",
  resultado: Record<string, unknown>,
) {
  const { data, error } = await intento.admin.rpc("registrar_resultado_timbrado_isr", {
    p_factura_id: intento.facturaId, p_claim: intento.claim, p_estado: estado, p_resultado: resultado,
  });
  if (error || data == null) return { estado: "error" as const, registrado: false as const };
  return { estado: String(data.estado), registrado: true as const };
}

interface ConciliacionIsr extends EmisionIsr {
  esperado: PrevalidacionTimbradoIsr;
  remoto: DocumentoFacturapiIsr;
  apiKey: string;
}

type DatosEvidencia = Pick<ConciliacionIsr, "admin" | "organizationId" | "esperado" | "remoto" | "apiKey" | "claim">;

export async function conciliarYRegistrarIsr(input: ConciliacionIsr, request: typeof fetch = fetch) {
  const resultado = await obtenerEvidenciaCfdiIsr(input, "emitidas", request);
  return registrarResultadoIsr(input, resultado.estado, resultado.datos);
}

export async function obtenerEvidenciaCfdiIsr(
  input: DatosEvidencia, carpeta: "emitidas" | "notas-credito", request: typeof fetch = fetch,
) {
  const { esperado, claim, remoto } = input;
  return obtenerEvidenciaTimbradoIsr({
    ...input, carpeta, tipo: esperado.tipo ?? "I", ambiente: esperado.ambiente, facturapiOrgId: esperado.emisor.facturapi_org_id,
    conciliar: (xml) => ({ ...conciliarCfdiIsr(esperado, claim, remoto, xml), factura_uuid: esperado.factura_uuid }),
  }, request);
}

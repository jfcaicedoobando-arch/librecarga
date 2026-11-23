import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import { jsonResponse } from "../_shared/response.ts";
import { consultarPerfilProveedor } from "../_shared/facturapiPerfilProveedor.ts";
import type { FacturaRow } from "./types.ts";
import type { PrevalidacionTimbradoIsr } from "../_shared/conciliarCfdiIsr.ts";

interface EmisorEsperado {
  facturapi_org_id: string;
  rfc: string;
  regimen_fiscal: string;
  codigo_postal: string;
  razon_social: string;
}

export interface PrevalidacionIsr {
  ambiente: "sandbox" | "live";
  emisor: EmisorEsperado;
}

export interface BorradorIsrValidado extends PrevalidacionIsr {
  captura: PrevalidacionTimbradoIsr & Record<string, unknown>;
}

function objeto(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function respuestaRevision() {
  return jsonResponse({
    error: "isr_requiere_revision",
    message: "Revisa el perfil fiscal, el receptor y el desglose del borrador antes de timbrar.",
  }, 409);
}

function perfilNoVerificable() {
  return jsonResponse({
    error: "isr_perfil_no_verificable",
    message: "No se pudo verificar el perfil fiscal para el timbrado. Intenta de nuevo más tarde.",
  }, 503);
}

export function respuestaIsrPendiente() {
  return jsonResponse({
    error: "isr_timbrado_pendiente",
    message: "El timbrado de este borrador requiere habilitar la validación fiscal de la organización.",
  }, 409);
}

export async function revisarBorradorIsr(
  supabase: SupabaseClient,
  factura: FacturaRow,
): Promise<BorradorIsrValidado | Response | null> {
  const { data, error } = await supabase.rpc("prevalidar_emision_isr_factura", { p_factura_id: factura.id });
  if (error) return error.code === "23514" ? respuestaRevision() : perfilNoVerificable();
  if (data == null) return factura.evaluacion_fiscal == null ? null : respuestaRevision();

  const resultado = objeto(data);
  const { facturapi_org_id, rfc, regimen_fiscal, codigo_postal, razon_social } = objeto(resultado.emisor);
  const { ambiente } = resultado;
  if (resultado.factura_id !== factura.id || resultado.organization_id !== factura.organization_id
    || (ambiente !== "sandbox" && ambiente !== "live")
    || typeof facturapi_org_id !== "string" || typeof rfc !== "string"
    || typeof regimen_fiscal !== "string" || typeof codigo_postal !== "string"
    || typeof razon_social !== "string") return perfilNoVerificable();
  if (typeof resultado.factura_actualizada_at !== "string" || resultado.factura_actualizada_at !== factura.updated_at) {
    return respuestaRevision();
  }
  return {
    ambiente, emisor: { facturapi_org_id, rfc, regimen_fiscal, codigo_postal, razon_social },
    captura: data as BorradorIsrValidado["captura"],
  };
}

export async function validarEmisorFacturapi(
  esperado: PrevalidacionIsr,
  credenciales: { ambiente: string; facturapiOrgId: string | null; apiKey: string },
  consultar = consultarPerfilProveedor,
): Promise<Response | EmisorEsperado> {
  if (credenciales.ambiente !== esperado.ambiente || credenciales.facturapiOrgId !== esperado.emisor.facturapi_org_id) {
    return respuestaRevision();
  }
  try {
    const perfil = await consultar(credenciales.apiKey);
    const emisor = esperado.emisor;
    if (perfil.facturapi_org_id !== emisor.facturapi_org_id || perfil.rfc !== emisor.rfc
      || perfil.regimen_fiscal !== emisor.regimen_fiscal || perfil.codigo_postal !== emisor.codigo_postal
      || perfil.razon_social !== emisor.razon_social) return respuestaRevision();
    return { ...emisor };
  } catch {
    return perfilNoVerificable();
  }
}

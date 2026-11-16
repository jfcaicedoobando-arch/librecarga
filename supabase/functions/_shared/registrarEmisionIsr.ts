import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import {
  conciliarCfdiIsr,
  type DocumentoFacturapiIsr,
  type PrevalidacionTimbradoIsr,
} from "./conciliarCfdiIsr.ts";
import { basicAuthHeader, FACTURAPI_BASE } from "./facturapiAuth.ts";

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

async function leerXml(apiKey: string, id: string, request: typeof fetch): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const respuesta = await request(`${FACTURAPI_BASE}/invoices/${id}/xml`, {
      headers: { Authorization: basicAuthHeader(apiKey), Accept: "application/xml" },
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    return respuesta.ok ? new Uint8Array(await respuesta.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

async function sha256(bytes: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function conciliarYRegistrarIsr(input: ConciliacionIsr, request: typeof fetch = fetch) {
  const { admin, organizationId, esperado, remoto } = input;
  const id = remoto.id != null && /^[A-Za-z0-9_-]{1,150}$/.test(remoto.id) ? remoto.id : null;
  const referencias = { facturapi_id: id, uuid: remoto.uuid ?? null, total: remoto.total ?? null };
  if (remoto.external_id == null || remoto.livemode == null) {
    return registrarResultadoIsr(input, "pendiente", { motivo: "respuesta_sin_referencia" });
  }
  if (remoto.external_id !== input.claim || remoto.livemode !== (esperado.ambiente === "live")
    || (remoto.organization != null && remoto.organization !== esperado.emisor.facturapi_org_id)) {
    // The remote resource is unbound. Keep the original claim without adopting
    // an identifier that may belong to another invoice or environment.
    return registrarResultadoIsr(input, "conciliacion", { motivo: "respuesta_ajena_al_intento" });
  }
  if (!id || !remoto.uuid || remoto.status !== "valid") {
    return registrarResultadoIsr(input, "pendiente", { ...referencias, motivo: "pendiente_proveedor" });
  }

  const bytes = await leerXml(input.apiKey, id, request);
  if (!bytes) return registrarResultadoIsr(input, "pendiente", { ...referencias, motivo: "xml_pendiente" });
  let xml;
  try {
    xml = conciliarCfdiIsr(esperado, input.claim, remoto, new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return registrarResultadoIsr(input, "conciliacion", { ...referencias, motivo: "descuadre_cfdi" });
  }

  const ruta = `${organizationId}/emitidas/${xml.uuid}.xml`;
  const { error } = await admin.storage.from("facturas").upload(ruta, bytes, { contentType: "application/xml", upsert: true });
  if (error) return registrarResultadoIsr(input, "pendiente", { ...referencias, motivo: "respaldo_xml_pendiente" });
  return registrarResultadoIsr(input, "confirmado", {
    ...referencias, external_id: input.claim, ambiente: esperado.ambiente, facturapi_org_id: esperado.emisor.facturapi_org_id,
    moneda: remoto.currency, folio: remoto.folio_number, serie: remoto.series ?? "",
    xml: { ...xml, ruta, sha256: await sha256(bytes) },
  });
}

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

type DatosEvidencia = Pick<ConciliacionIsr, "admin" | "organizationId" | "esperado" | "remoto" | "apiKey" | "claim">;

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
  const resultado = await obtenerEvidenciaCfdiIsr(input, "emitidas", request);
  return registrarResultadoIsr(input, resultado.estado, resultado.datos);
}

export async function obtenerEvidenciaCfdiIsr(
  input: DatosEvidencia, carpeta: "emitidas" | "notas-credito", request: typeof fetch = fetch,
): Promise<{ estado: "pendiente" | "conciliacion" | "confirmado"; datos: Record<string, unknown> }> {
  const { admin, organizationId, esperado, remoto } = input;
  const id = remoto.id != null && /^[A-Za-z0-9_-]{1,150}$/.test(remoto.id) ? remoto.id : null;
  const referencias = { facturapi_id: id, uuid: remoto.uuid ?? null, total: remoto.total ?? null,
    external_id: input.claim, ambiente: esperado.ambiente, facturapi_org_id: esperado.emisor.facturapi_org_id };
  if (remoto.external_id == null || remoto.livemode == null) {
    return { estado: "pendiente", datos: { motivo: "respuesta_sin_referencia" } };
  }
  if (remoto.external_id !== input.claim || remoto.livemode !== (esperado.ambiente === "live")
    || (remoto.type != null && remoto.type !== (esperado.tipo ?? "I"))
    || (remoto.organization != null && remoto.organization !== esperado.emisor.facturapi_org_id)) {
    // The remote resource is unbound. Keep the original claim without adopting
    // an identifier that may belong to another invoice or environment.
    return { estado: "conciliacion", datos: { motivo: "respuesta_ajena_al_intento" } };
  }
  if (!id || !remoto.uuid || remoto.status !== "valid") {
    return { estado: "pendiente", datos: { ...referencias, motivo: "pendiente_proveedor" } };
  }

  const bytes = await leerXml(input.apiKey, id, request);
  if (!bytes) return { estado: "pendiente", datos: { ...referencias, motivo: "xml_pendiente" } };
  let xml;
  try {
    xml = conciliarCfdiIsr(esperado, input.claim, remoto, new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { estado: "conciliacion", datos: { ...referencias, motivo: "descuadre_cfdi" } };
  }

  const ruta = `${organizationId}/${carpeta}/${xml.uuid}.xml`;
  const { error } = await admin.storage.from("facturas").upload(ruta, bytes, { contentType: "application/xml", upsert: true });
  if (error) return { estado: "pendiente", datos: { ...referencias, motivo: "respaldo_xml_pendiente" } };
  return { estado: "confirmado", datos: {
    ...referencias,
    moneda: remoto.currency, folio: remoto.folio_number, serie: remoto.series ?? "",
    xml: { ...xml, factura_uuid: esperado.factura_uuid, ruta, sha256: await sha256(bytes) },
  } };
}

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import type { DocumentoFacturapiIsr } from "./conciliarCfdiIsr.ts";
import { basicAuthHeader, FACTURAPI_BASE, type FacturapiAmbiente } from "./facturapiAuth.ts";

export interface EvidenciaTimbradoIsr {
  admin: SupabaseClient;
  organizationId: string;
  claim: string;
  remoto: DocumentoFacturapiIsr;
  apiKey: string;
  ambiente: FacturapiAmbiente;
  facturapiOrgId: string;
  tipo: "I" | "E" | "P";
  carpeta: "emitidas" | "notas-credito" | "rep";
  conciliar: (xml: string) => { uuid: string };
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

function revisarReferencia(input: EvidenciaTimbradoIsr) {
  const { remoto } = input;
  if (remoto.external_id == null || remoto.livemode == null) {
    return { estado: "pendiente", datos: { motivo: "respuesta_sin_referencia" } } as const;
  }
  if (remoto.external_id !== input.claim || remoto.livemode !== (input.ambiente === "live")
    || (remoto.type != null && remoto.type !== input.tipo)
    || (remoto.organization != null && remoto.organization !== input.facturapiOrgId)) {
    return { estado: "conciliacion", datos: { motivo: "respuesta_ajena_al_intento" } } as const;
  }
  return null;
}

export async function obtenerEvidenciaTimbradoIsr(
  input: EvidenciaTimbradoIsr, request: typeof fetch = fetch,
): Promise<{ estado: "pendiente" | "conciliacion" | "confirmado"; datos: Record<string, unknown> }> {
  const corte = revisarReferencia(input);
  if (corte) return corte;
  const { admin, organizationId, remoto } = input;
  const id = remoto.id != null && /^[A-Za-z0-9_-]{1,150}$/.test(remoto.id) ? remoto.id : null;
  const referencias = { facturapi_id: id, uuid: remoto.uuid ?? null, total: remoto.total ?? null,
    external_id: input.claim, ambiente: input.ambiente, facturapi_org_id: input.facturapiOrgId };
  if (!id || !remoto.uuid || remoto.status !== "valid") {
    return { estado: "pendiente", datos: { ...referencias, motivo: "pendiente_proveedor" } };
  }

  const bytes = await leerXml(input.apiKey, id, request);
  if (!bytes) return { estado: "pendiente", datos: { ...referencias, motivo: "xml_pendiente" } };
  let xml;
  try {
    xml = input.conciliar(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { estado: "conciliacion", datos: { ...referencias, motivo: "descuadre_cfdi" } };
  }

  const ruta = `${organizationId}/${input.carpeta}/${xml.uuid}.xml`;
  const { error } = await admin.storage.from("facturas").upload(ruta, bytes, { contentType: "application/xml", upsert: true });
  if (error) return { estado: "pendiente", datos: { ...referencias, motivo: "respaldo_xml_pendiente" } };
  return { estado: "confirmado", datos: {
    ...referencias,
    moneda: remoto.currency, folio: remoto.folio_number, serie: remoto.series ?? "",
    xml: { ...xml, ruta, sha256: await sha256(bytes) },
  } };
}

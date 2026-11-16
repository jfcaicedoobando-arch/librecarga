import { consultarPerfilProveedor } from "./facturapiPerfilProveedor.ts";
import type { DocumentoFacturapiIsr, PrevalidacionTimbradoIsr } from "./conciliarCfdiIsr.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { getFacturapiClient, withFacturapiTimeout } from "./facturapiClient.ts";
import { asFacturapiApi, exigirOperacion } from "./facturapiSdk.ts";
import { conciliarYRegistrarIsr, obtenerIntentoIsr, type EmisionIsr } from "./registrarEmisionIsr.ts";

export async function consultarIntentoIsr(intento: EmisionIsr, request: typeof fetch = fetch) {
  const guardado = await obtenerIntentoIsr(intento);
  if (!guardado) return null;
  const resuelto = await resolverLlaveRecuperacionIsr(intento.admin, intento.organizationId, guardado.esperado, request);
  return resuelto ? { ...intento, ...guardado, ...resuelto } : null;
}

export async function resolverLlaveRecuperacionIsr(
  admin: SupabaseClient, organizationId: string, esperado: Pick<PrevalidacionTimbradoIsr, "ambiente" | "emisor">,
  request: typeof fetch = fetch,
) {
  const { ambiente, emisor } = esperado;
  const resuelto = await getFacturapiClient(admin, organizationId, ambiente);
  if (!resuelto.ok || resuelto.data.ambiente !== ambiente || resuelto.data.facturapiOrgId !== emisor.facturapi_org_id) {
    return null;
  }
  try {
    // A rotated key can recover a historical CFDI if it still belongs to the
    // same organization. The XML is checked against the historical profile.
    const perfil = await consultarPerfilProveedor(resuelto.data.apiKey, request);
    if (perfil.facturapi_org_id !== emisor.facturapi_org_id) return null;
    return resuelto.data;
  } catch {
    return null;
  }
}

type IntentoConsultable = NonNullable<Awaited<ReturnType<typeof consultarIntentoIsr>>>;

export async function recuperarEmisionIsr(
  intento: IntentoConsultable, id: string, request: typeof fetch = fetch,
) {
  if (intento.facturapiId && intento.facturapiId !== id) return null;
  const remoto = await consultarCfdiRemoto(intento.client, id);
  if (!remoto) return null;
  const resultado = await conciliarYRegistrarIsr({ ...intento, remoto }, request);
  return { estado: resultado.estado, remoto };
}

export async function consultarCfdiRemoto(client: unknown, id: string): Promise<DocumentoFacturapiIsr | null> {
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(id)) return null;
  try {
    const consultar = exigirOperacion<(id: string) => Promise<DocumentoFacturapiIsr>>(
      asFacturapiApi(client), "invoices.retrieve",
    );
    const remoto = await withFacturapiTimeout("invoices.retrieve", consultar(id));
    return remoto?.id === id ? remoto : null;
  } catch {
    return null;
  }
}

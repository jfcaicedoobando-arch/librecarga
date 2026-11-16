import { consultarPerfilProveedor } from "./facturapiPerfilProveedor.ts";
import type { DocumentoFacturapiIsr } from "./conciliarCfdiIsr.ts";
import { getFacturapiClient, withFacturapiTimeout } from "./facturapiClient.ts";
import { asFacturapiApi, exigirOperacion } from "./facturapiSdk.ts";
import { conciliarYRegistrarIsr, obtenerIntentoIsr, type EmisionIsr } from "./registrarEmisionIsr.ts";

export async function consultarIntentoIsr(intento: EmisionIsr, request: typeof fetch = fetch) {
  const guardado = await obtenerIntentoIsr(intento);
  if (!guardado) return null;

  const { ambiente, emisor } = guardado.esperado;
  const resuelto = await getFacturapiClient(intento.admin, intento.organizationId, ambiente);
  if (!resuelto.ok || resuelto.data.ambiente !== ambiente || resuelto.data.facturapiOrgId !== emisor.facturapi_org_id) {
    return null;
  }
  try {
    // A rotated key can recover a historical CFDI if it still belongs to the
    // same organization. The XML is checked against the historical profile.
    const perfil = await consultarPerfilProveedor(resuelto.data.apiKey, request);
    if (perfil.facturapi_org_id !== emisor.facturapi_org_id) return null;
    return { ...intento, ...guardado, ...resuelto.data };
  } catch {
    return null;
  }
}

type IntentoConsultable = NonNullable<Awaited<ReturnType<typeof consultarIntentoIsr>>>;

export async function recuperarEmisionIsr(
  intento: IntentoConsultable, id: string, request: typeof fetch = fetch,
) {
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(id) || (intento.facturapiId && intento.facturapiId !== id)) return null;
  let remoto: DocumentoFacturapiIsr;
  try {
    const consultar = exigirOperacion<(id: string) => Promise<DocumentoFacturapiIsr>>(
      asFacturapiApi(intento.client), "invoices.retrieve",
    );
    remoto = await withFacturapiTimeout("invoices.retrieve", consultar(id));
  } catch {
    return null;
  }
  if (remoto?.id !== id) return null;
  const resultado = await conciliarYRegistrarIsr({ ...intento, remoto }, request);
  return { estado: resultado.estado, remoto };
}

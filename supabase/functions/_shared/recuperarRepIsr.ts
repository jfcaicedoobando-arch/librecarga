import { consultarCfdiRemoto, resolverLlaveRecuperacionIsr } from "./recuperarEmisionIsr.ts";
import { conciliarYRegistrarRepIsr, type IntentoRepIsr } from "./registrarRepIsr.ts";

export function resolverLlaveRepIsr(intento: IntentoRepIsr, request: typeof fetch = fetch) {
  const { ambiente, emisor } = intento.esperado.perfil;
  return resolverLlaveRecuperacionIsr(intento.admin, intento.organizationId, {
    ambiente, emisor: { facturapi_org_id: emisor.facturapiOrgId, rfc: emisor.rfc, regimen_fiscal: emisor.regimen },
  }, request);
}

export async function recuperarRepConLlaveIsr(
  intento: IntentoRepIsr, id: string, llave: { client: unknown; apiKey: string }, request: typeof fetch = fetch,
) {
  const remoto = await consultarCfdiRemoto(llave.client, id);
  if (!remoto) return null;
  const estado = await conciliarYRegistrarRepIsr(intento, remoto, llave.apiKey, request);
  return estado === "confirmado" ? remoto : null;
}

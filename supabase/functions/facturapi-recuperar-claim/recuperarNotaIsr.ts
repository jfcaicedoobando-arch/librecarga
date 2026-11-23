import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";
import { consultarCfdiRemoto, resolverLlaveRecuperacionIsr } from "../_shared/recuperarEmisionIsr.ts";
import { conciliarNotaCreditoIsr, obtenerIntentoNotaIsr } from "../_shared/registrarNotaCreditoIsr.ts";
import { jsonResponse } from "../_shared/response.ts";
import { respuestaPendienteRemoto } from "./pendienteRemoto.ts";
import { buscarCfdiPorExternalId } from "./recuperar.ts";
import type { NotaCreditoRow } from "./recuperar.nc.ts";

export async function recuperarNotaIsr(
  admin: SupabaseClient, nc: NotaCreditoRow, claim: string,
  request: typeof fetch = fetch, resolverLlave = resolverLlaveRecuperacionIsr,
): Promise<Response | null> {
  const guardado = await obtenerIntentoNotaIsr({ admin, notaId: nc.id, organizationId: nc.organization_id }, claim);
  if (guardado.tipo === "legacy") return null;
  if (guardado.tipo === "pendiente") return respuestaPendienteRemoto(null, claim);
  const { intento } = guardado;
  const llave = await resolverLlave(admin, nc.organization_id, intento.esperado, request);
  if (!llave) return respuestaPendienteRemoto(null, claim);

  let id = guardado.facturapiId;
  if (!id) {
    const busqueda = await buscarCfdiPorExternalId(llave.client, claim, nc.facturapi_claim_at);
    if (busqueda instanceof Response) return busqueda;
    if (busqueda.kind !== "encontrado" && busqueda.kind !== "pendiente_remoto") return respuestaPendienteRemoto(null, claim);
    id = busqueda.invoice.id ?? null;
  }
  const remoto = id ? await consultarCfdiRemoto(llave.client, id) : null;
  if (!remoto || await conciliarNotaCreditoIsr(intento, remoto, llave.apiKey, request) !== "confirmado") {
    return respuestaPendienteRemoto(null, claim);
  }
  return jsonResponse({
    outcome: "promovido", message: "Se recuperó la nota de crédito y se verificó su XML.",
    facturapi_id: remoto.id, uuid: remoto.uuid?.toUpperCase(), folio: remoto.folio_number, serie: remoto.series ?? "",
  });
}

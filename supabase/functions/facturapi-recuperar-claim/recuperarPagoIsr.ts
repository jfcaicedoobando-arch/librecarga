import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { obtenerIntentoRepIsr } from "../_shared/registrarRepIsr.ts";
import { recuperarRepConLlaveIsr, resolverLlaveRepIsr } from "../_shared/recuperarRepIsr.ts";
import { jsonResponse } from "../_shared/response.ts";
import type { PagoRow } from "./recuperar.pago.ts";
import { buscarCfdiPorExternalId } from "./recuperar.ts";
import { respuestaPendienteRemoto } from "./pendienteRemoto.ts";

export async function recuperarPagoIsr(admin: SupabaseClient, pago: PagoRow, claim: string,
  request: typeof fetch = fetch, resolverLlave = resolverLlaveRepIsr): Promise<Response | null> {
  const guardado = await obtenerIntentoRepIsr({ admin, pagoId: pago.id, organizationId: pago.organization_id }, claim);
  if (guardado.tipo === "legacy") return null;
  const pendiente = () => respuestaPendienteRemoto(null, claim);
  if (guardado.tipo !== "vigente") return pendiente();
  const { intento } = guardado;
  const llave = await resolverLlave(intento, request);
  if (!llave) return pendiente();
  let id = guardado.facturapiId;
  if (!id) {
    const encontrados = await buscarCfdiPorExternalId(llave.client, claim, pago.facturapi_rep_claim_at);
    if (encontrados instanceof Response) return encontrados;
    if (encontrados.kind !== "encontrado" && encontrados.kind !== "pendiente_remoto") return pendiente();
    id = encontrados.invoice.id ?? null;
  }
  const remoto = id ? await recuperarRepConLlaveIsr(intento, id, llave, request) : null;
  return remoto ? jsonResponse({ outcome: "promovido", message: "Se recuperó el REP y se verificó su XML.",
    facturapi_id: remoto.id, uuid: remoto.uuid?.toUpperCase(), folio: remoto.folio_number ?? 0, serie: remoto.series ?? "" }) : pendiente();
}

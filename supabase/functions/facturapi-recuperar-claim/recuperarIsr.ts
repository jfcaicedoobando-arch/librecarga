import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { consultarIntentoIsr, recuperarEmisionIsr } from "../_shared/recuperarEmisionIsr.ts";
import { jsonResponse } from "../_shared/response.ts";
import { respuestaPendienteRemoto } from "./pendienteRemoto.ts";
import { buscarCfdiPorExternalId, type FacturaRow } from "./recuperar.ts";

export async function recuperarFacturaIsr(admin: SupabaseClient, factura: FacturaRow, claim: string) {
  const intento = await consultarIntentoIsr({ admin, facturaId: factura.id, organizationId: factura.organization_id, claim });
  if (!intento) return respuestaPendienteRemoto(null, claim);

  let id = intento.facturapiId;
  if (!id) {
    const busqueda = await buscarCfdiPorExternalId(intento.client, claim, factura.facturapi_claim_at);
    if (busqueda instanceof Response) return busqueda;
    if (busqueda.kind !== "encontrado" && busqueda.kind !== "pendiente_remoto") return respuestaPendienteRemoto(null, claim);
    id = busqueda.invoice.id ?? null;
  }

  const resultado = id ? await recuperarEmisionIsr(intento, id) : null;
  if (resultado?.estado !== "confirmado") return respuestaPendienteRemoto(null, claim);
  const remoto = resultado.remoto;
  return jsonResponse({
    outcome: "promovido",
    message: "Se recuperó el CFDI y su XML coincide con la evaluación fiscal de la factura.",
    facturapi_id: remoto.id, uuid: remoto.uuid?.toUpperCase(), folio: remoto.folio_number, serie: remoto.series ?? "",
  });
}

/**
 * Caso de uso "emitir REP" — orquesta las cuatro etapas en el MISMO orden
 * funcional que tenía `index.ts`, que ahora es sólo el adaptador HTTP:
 *
 *   1. precarga/autorización del pago (candado de REP ya timbrado)
 *   2. cliente FacturApi de la organización (lo crea el adaptador)
 *   3. factura PPD timbrada + resolución fiscal + contexto de datos
 *   4. PagoContext + validación + paridad con `invoices.paymentSummary`
 *   5. claim atómico → timbrado → 202 pendiente o persistencia
 *
 * Cada etapa devuelve su valor tipado o la `Response` con la que se corta.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { precargarPagoRep } from "./precargaPago.ts";
import { cargarDatosPago, cargarFacturaPpd } from "./etapaDatos.ts";
import { resolverFiscalRep } from "./etapaFiscal.ts";
import { construirPagoContext, validarPagoContext } from "./etapaContexto.ts";
import { emitirRepYPersistir } from "./etapaEmision.ts";
import { verificarResumenProveedor } from "./resumenProveedor.ts";
import type { JsonFn, UsuarioRep } from "./etapaResultado.ts";
import { MENSAJE_PERFIL_CFDI_ORIGEN, perfilCfdiOrigen, type PerfilCfdiOrigen } from "../_shared/perfilCfdiOrigen.ts";
import { emitirRepIsr } from "./emitirIsr.ts";

/** Datos del SDK resueltos por organización (multi-tenant). */
export interface FacturapiResuelto {
  /** Cliente opaco del SDK v5; lo tipan los adaptadores compartidos. */
  client: object;
  apiKey: string;
  ambiente: string;
}

export interface ArgsCasoUsoRep {
  supabase: SupabaseClient;
  admin?: SupabaseClient;
  pagoId: string;
  usuario: UsuarioRep;
  json: JsonFn;
  /** Resuelve el cliente de FacturApi de la organización, o la Response de corte. */
  resolverFacturapi: (
    organizationId: string,
    origen: PerfilCfdiOrigen | null,
  ) => Promise<{ ok: true; data: FacturapiResuelto } | { ok: false; response: Response }>;
}

export async function emitirRepCasoUso(args: ArgsCasoUsoRep): Promise<Response> {
  const { supabase, pagoId, usuario, json } = args;

  // 1) Pago (carga + candado de REP ya timbrado + autorización)
  const precarga = await precargarPagoRep(supabase, pagoId, usuario.id, json);
  if ("response" in precarga) return precarga.response;
  const { pago } = precarga;

  // 2) La factura relacionada identifica el ambiente fiscal del REP.
  const etapaFactura = await cargarFacturaPpd(supabase, pago.factura_id, pago.organization_id, json);
  if (!etapaFactura.ok) return etapaFactura.response;
  const factura = etapaFactura.valor;
  const origen = perfilCfdiOrigen(factura, pago.organization_id);
  if (origen === "incompleto") return json({ error: "perfil_cfdi_origen", message: MENSAJE_PERFIL_CFDI_ORIGEN }, 409);

  const sdk = await args.resolverFacturapi(pago.organization_id, origen);
  if (!sdk.ok) return sdk.response;
  const facturapi = sdk.data.client;

  // 3) Tratamiento fiscal autoritativo y datos del pago.
  const etapaFiscal = await resolverFiscalRep(supabase, factura, pago.id, json);
  if (!etapaFiscal.ok) return etapaFiscal.response;

  const etapaDatos = await cargarDatosPago(supabase, factura, pago, json, origen);
  if (!etapaDatos.ok) return etapaDatos.response;

  // 4) Contexto del REP + validación + paridad con el proveedor.
  const etapaCtx = await validarPagoContext(
    supabase,
    construirPagoContext({ factura, pago, fiscal: etapaFiscal.valor, datos: etapaDatos.valor }),
    pago.id,
    json,
    pago.updated_at,
  );
  if (!etapaCtx.ok) return etapaCtx.response;
  const ctx = etapaCtx.valor;

  if (origen) {
    if (!args.admin || !pago.updated_at) return json({ error: "reserva_rep_fiscal" }, 503);
    return emitirRepIsr({ rep: { admin: args.admin, pagoId: pago.id, organizationId: pago.organization_id },
      ctx, actor: usuario.id, updatedAt: pago.updated_at, facturaRemota: factura.facturapi_id ?? null, origen, facturapi: sdk.data, json });
  }

  // P1 · FacturAPI 5.0 — `invoices.paymentSummary` es la AUTORIDAD del saldo.
  // Si el proveedor difiere fuera de tolerancia, o no se puede consultar, NO se
  // reclama ni se timbra (sin mutar estado_rep a Error).
  const paridad = await verificarResumenProveedor({
    facturapi, facturaFacturapiId: factura.facturapi_id ?? null, ctx, supabase,
    pagoId: pago.id, organizationId: pago.organization_id,
    usuarioId: usuario.id, usuarioEmail: usuario.email, json,
  });
  if (paridad) return paridad;

  // 5) Claim atómico → timbrado → 202 pendiente o persistencia final.
  return await emitirRepYPersistir({
    supabase, facturapi, apiKey: sdk.data.apiKey, ambiente: sdk.data.ambiente,
    pago, facturaId: factura.id, ctx, usuario, json,
  });
}

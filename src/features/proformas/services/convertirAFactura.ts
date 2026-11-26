/**
 * Conversión Proforma(s) → Factura (borrador).
 * Llama al RPC `convertir_proformas_a_factura` (Fase 1/2 del flujo lineal
 * Proforma → Factura → Timbrado → Pago → REP).
 *
 * Soporta:
 * - Fusión N:1 (varias proformas del mismo cliente en una sola factura).
 * - Split por moneda: si la proforma tiene importes en USD y MXN, se generan
 *   dos borradores (uno por moneda) porque el SAT no permite CFDI multi-moneda.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Moneda } from "@/types/db";
import { validarUsoCfdiIngreso } from "@/lib/financial/usoCfdiFiscal";

export interface ConvertirProformaParams {
  proformaIds: string[];
  serieId: string;
  metodoPago: "PUE" | "PPD";
  formaPago: string;   // catálogo SAT
  usoCfdi: string;     // catálogo SAT
  /**
   * Plazo de crédito explícito. Si es `null`/`undefined` la RPC aplica la
   * cascada proforma → ficha del cliente → 0 (v13.331.9). Enviar 0 aquí
   * forzaría facturas que vencen el mismo día de emisión.
   */
  diasCredito?: number | null;
  notas?: string | null;
  requestId?: string;  // idempotencia
}

export interface FacturaBorrador {
  facturaId: string;
  facturaNumero: string;
  moneda: Moneda;
}

export type ConvertirProformaResult = FacturaBorrador[];

export async function fetchUsoCfdiProforma(proformaId: string, organizationId: string): Promise<string> {
  const { data: proforma, error: errorProforma } = await supabase.from("proformas")
    .select("cliente_id").eq("id", proformaId).eq("organization_id", organizationId)
    .is("deleted_at", null).maybeSingle();
  if (errorProforma) throw errorProforma;
  if (!proforma?.cliente_id) throw new Error("No se encontró el cliente de la proforma.");
  const { data: cliente, error } = await supabase.from("clientes")
    .select("rfc, regimen_fiscal, uso_cfdi_default")
    .eq("id", proforma.cliente_id).eq("organization_id", organizationId).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  const regimen = cliente?.regimen_fiscal ?? "";
  const usoCfdi = cliente?.uso_cfdi_default?.trim() || (regimen === "616" ? "S01" : "G03");
  if (!cliente?.rfc || validarUsoCfdiIngreso({ rfc: cliente.rfc, regimen, usoCfdi }).length) {
    throw new Error("Configura un uso CFDI compatible con el régimen del receptor en la ficha del cliente antes de convertir la proforma.");
  }
  return usoCfdi;
}

export async function convertirProformaAFactura(
  params: ConvertirProformaParams,
): Promise<ConvertirProformaResult> {
  if (!params.proformaIds.length) {
    throw new Error("Selecciona al menos una proforma");
  }
  const { data, error } = await supabase.rpc("convertir_proformas_a_factura", {
    p_proforma_ids: params.proformaIds,
    p_serie_id: params.serieId,
    p_metodo_pago: params.metodoPago,
    p_forma_pago: params.formaPago,
    p_uso_cfdi: params.usoCfdi,
    p_dias_credito: params.diasCredito ?? undefined,
    p_notas: params.notas ?? undefined,
    p_request_id: params.requestId ?? undefined,
  });
  if (error) throw error;
  // SAFE-CAST: el RPC devuelve SETOF facturas; extraemos id, numero y moneda.
  const rows = (data ?? []) as unknown as Array<{ id: string; numero: string; moneda: Moneda }>;
  if (!rows.length) throw new Error("No se pudo generar la factura");
  return rows.map((r) => ({
    facturaId: r.id,
    facturaNumero: r.numero,
    moneda: r.moneda,
  }));
}

/**
 * Devuelve la primera serie de facturación activa de la organización
 * (ordenada por `prefijo`). Se usa para el flujo de conversión "de un clic":
 * el usuario no elige serie; se toma la default y puede cambiarla en el
 * borrador antes de timbrar.
 */
export async function fetchPrimeraSerieActiva(
  organizationId: string,
): Promise<{ id: string; prefijo: string } | null> {
  const { data, error } = await supabase
    .from("factura_series")
    .select("id, prefijo")
    .eq("organization_id", organizationId)
    .eq("activa", true)
    .order("prefijo")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Clasificación persistida: nunca inferir salida de caja del método o referencia. */
import { supabase } from "@/integrations/supabase/client";
import { MovimientoVinculoError } from "./conciliacionErrors";

async function leerPagoProveedor(pagoId: string) {
  const { data, error } = await supabase.from("pagos_proveedor")
    .select("es_ajuste, lote_id, metodo_pago").eq("id", pagoId).is("deleted_at", null).maybeSingle();
  if (error || typeof data?.es_ajuste !== "boolean") {
    throw new MovimientoVinculoError(
      "LC_MOVIMIENTO_PAGO_NO_VERIFICABLE",
      "No se pudo verificar el pago a proveedor. Recarga antes de vincularlo al banco.",
    );
  }
  return data;
}

export function esPagoProveedorConciliable(pago: { es_ajuste: boolean; lote_id?: string | null; metodo_pago?: string | null }) {
  return pago.es_ajuste === false && !pago.lote_id &&
    !["efectivo", "01"].includes(pago.metodo_pago?.trim().toLowerCase() ?? "");
}

export async function esAjusteProveedorPersistido(pagoId: string): Promise<boolean> {
  return (await leerPagoProveedor(pagoId)).es_ajuste;
}

export async function esPagoProveedorConciliablePersistido(pagoId: string): Promise<boolean> {
  return esPagoProveedorConciliable(await leerPagoProveedor(pagoId));
}

export async function assertPagoProveedorMonetario(pagoId: string): Promise<void> {
  const pago = await leerPagoProveedor(pagoId);
  if (pago.es_ajuste) {
    throw new MovimientoVinculoError(
      "LC_MOVIMIENTO_AJUSTE_NO_MONETARIO",
      "Un ajuste no monetario no puede vincularse a un movimiento bancario.",
    );
  }
  if (!esPagoProveedorConciliable(pago)) {
    throw new MovimientoVinculoError("LC_MOVIMIENTO_PAGO_NO_CONCILIABLE",
      "Los pagos en efectivo y las aplicaciones de un lote no se vinculan a cargos individuales.");
  }
}

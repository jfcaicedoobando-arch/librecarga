/**
 * Servicio: sugerir movimientos bancarios candidatos para un pago a proveedor.
 * Empareja por monto en moneda de la cuenta y fecha con movimientos Pendientes en
 * la cuenta bancaria del pago (si viene informada) o cualquier cuenta de la org.
 *
 * v13.190.0 · Ola 2 · Item 3 — Conciliación bancaria en detalle de factura.
 */
import { esAjusteProveedorPersistido } from "@/features/tesoreria/services";
import { supabase } from "@/integrations/supabase/client";
import {
  dentroDeTolerancia,
  toleranciaMonto,
  TOLERANCIA_DIAS,
  rangoFechasIso,
  deltaDiasIso,
} from "@/lib/domain/tolerancia";
import { roundMoney } from "@/lib/financial/financialUtils";
import { cargoEnMonedaCuenta } from "./pagoProveedorMovimiento";

export interface MovimientoCandidato {
  id: string;
  fecha: string;
  concepto: string | null;
  referencia: string | null;
  cargo: number;
  cuenta_bancaria_id: string;
  moneda_cuenta: string;
  delta_dias: number;
  delta_monto: number;
}

export async function sugerirMovsParaPagoProveedor(pago: {
  id: string;
  fecha_pago: string;
  monto: number;
  moneda: string;
  tipo_cambio_usd?: number | null;
  cuenta_bancaria_id: string | null;
}): Promise<MovimientoCandidato[]> {
  if (pago.monto <= 0) return [];
  if (await esAjusteProveedorPersistido(pago.id)) return [];
  const { desde, hasta } = rangoFechasIso(pago.fecha_pago, TOLERANCIA_DIAS);
  let cuentasQuery = supabase.from("cuentas_bancarias").select("id, moneda").is("deleted_at", null);
  if (pago.cuenta_bancaria_id) cuentasQuery = cuentasQuery.eq("id", pago.cuenta_bancaria_id);
  const { data: cuentas, error } = await cuentasQuery;
  if (error) throw error;

  const porMoneda = new Map<string, string[]>();
  for (const cuenta of cuentas ?? []) {
    const ids = porMoneda.get(cuenta.moneda) ?? [];
    ids.push(cuenta.id);
    porMoneda.set(cuenta.moneda, ids);
  }
  const grupos = await Promise.all([...porMoneda].map(async ([moneda, cuentaIds]) => {
    const cargoConvertido = cargoEnMonedaCuenta(pago.monto, pago.moneda, moneda, pago.tipo_cambio_usd ?? null);
    if (cargoConvertido === null || !Number.isFinite(cargoConvertido)) return [];
    const esperado = roundMoney(cargoConvertido);
    const tolerancia = toleranciaMonto(moneda);
    const { data, error: errorMovimientos } = await supabase.from("bbva_movimientos")
      .select("id, fecha, concepto, referencia, cargo, cuenta_bancaria_id").is("deleted_at", null)
      .in("cuenta_bancaria_id", cuentaIds)
      .eq("estado_conciliacion", "Pendiente").gte("fecha", desde).lte("fecha", hasta)
      .gte("cargo", roundMoney(esperado - tolerancia)).lte("cargo", roundMoney(esperado + tolerancia))
      .order("fecha", { ascending: false }).limit(20);
    if (errorMovimientos) throw errorMovimientos;
    return (data ?? []).filter((m) => dentroDeTolerancia(Number(m.cargo), esperado, tolerancia)).map((m) => ({
      ...m, cargo: Number(m.cargo), moneda_cuenta: moneda,
      delta_dias: deltaDiasIso(m.fecha, pago.fecha_pago),
      delta_monto: roundMoney(Math.abs(Number(m.cargo) - esperado)),
    }));
  }));
  return grupos.flat().sort((a, b) => a.delta_dias - b.delta_dias
    || a.delta_monto / (toleranciaMonto(a.moneda_cuenta) || 1) - b.delta_monto / (toleranciaMonto(b.moneda_cuenta) || 1)).slice(0, 20);
}

/** Valúa el cargo en la moneda del banco usando el tipo de cambio guardado del pago. */
export function cargoEnMonedaCuenta(
  monto: number,
  monedaPago: string,
  monedaCuenta: string | null,
  tipoCambioUsd: number | null,
): number | null {
  if (!monedaCuenta?.trim()) return null;
  if (monedaCuenta === monedaPago) return monto;
  if (tipoCambioUsd === null || !Number.isFinite(tipoCambioUsd) || tipoCambioUsd <= 0) return null;
  if (monedaPago === "USD" && monedaCuenta === "MXN") return monto * tipoCambioUsd;
  if (monedaPago === "MXN" && monedaCuenta === "USD") return monto / tipoCambioUsd;
  return null;
}

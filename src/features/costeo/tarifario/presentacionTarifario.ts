import { formatCurrency, formatNumber } from "@/lib/formatters/numbers";
import type { TarifaTarifario } from "./tarifarioService";

export function importeTarifario(tarifa: TarifaTarifario | null) {
  if (!tarifa) return "—";
  return /^[A-Z]{3}$/.test(tarifa.moneda)
    ? formatCurrency(tarifa.flete_base, tarifa.moneda)
    : formatNumber(tarifa.flete_base);
}

export function rutaTarifarioMultimodo(tarifa: TarifaTarifario) {
  if (tarifa.modo === "Aéreo") return [tarifa.aeropuerto_origen, tarifa.aeropuerto_destino] as const;
  if (tarifa.modo === "Terrestre") {
    return [
      tarifa.origen_ciudad?.trim() || tarifa.origen_cp,
      tarifa.destino_ciudad?.trim() || tarifa.destino_cp,
    ] as const;
  }
  return [];
}

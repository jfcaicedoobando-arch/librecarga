/**
 * Flete real de una tarifa aérea o terrestre (no marítima).
 *  - Por kg (Aéreo y LTL): precio del rango de peso × kilos; si no alcanza el
 *    mínimo por embarque, se cobra el mínimo como 1 embarque.
 *  - Por viaje (FTL/Arrastre): flete base × número de viajes.
 * Aéreo usa peso tasable (real vs volumétrico 1:6000); terrestre, peso real.
 */
import { fletePorPeso, pesoTasable, precioPorTramo, type TramoPeso } from "@/features/costeo/domain/tarifaPorPeso";
import { subtotalLinea } from "@/lib/financial/financialUtils";

export interface TarifaMultimodoCosteo {
  id: string;
  modo: "Aéreo" | "Terrestre";
  flete_base: number;
  minimo: number | null;
  unidad_flete: string | null;
  moneda: string | null;
  proveedor: string;
  tramos: TramoPeso[];
}

export interface FleteCalculado {
  cantidad: number; costo_unitario: number; unidad: string;
  /** Unidades reales para recargos por unidad (kg tasables aunque aplique el mínimo). */
  cantidadRecargos: number; unidadRecargos: string;
}

export function fleteMultimodo(
  tarifa: TarifaMultimodoCosteo,
  carga: { pesoKg: number; volumenM3: number; viajes: number },
): FleteCalculado | null {
  if (tarifa.unidad_flete !== "kg") {
    if (!(tarifa.flete_base > 0)) return null;
    const viajes = Math.max(1, Math.floor(carga.viajes) || 1);
    return { cantidad: viajes, costo_unitario: tarifa.flete_base, unidad: "viaje", cantidadRecargos: viajes, unidadRecargos: "viaje" };
  }
  const kg = tarifa.modo === "Aéreo" ? pesoTasable(carga.pesoKg, carga.volumenM3) : Math.max(0, carga.pesoKg || 0);
  if (!(kg > 0)) return null;
  const precio = precioPorTramo(tarifa.tramos, kg, tarifa.flete_base);
  const importe = fletePorPeso(tarifa.tramos, kg, tarifa.flete_base, tarifa.minimo);
  if (tarifa.minimo != null && importe === tarifa.minimo && importe > subtotalLinea(kg, precio)) {
    return { cantidad: 1, costo_unitario: tarifa.minimo, unidad: "embarque", cantidadRecargos: kg, unidadRecargos: "kg" };
  }
  if (!(precio > 0)) return null;
  return { cantidad: kg, costo_unitario: precio, unidad: "kg", cantidadRecargos: kg, unidadRecargos: "kg" };
}

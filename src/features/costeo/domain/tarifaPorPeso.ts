import { subtotalLinea } from "@/lib/financial/financialUtils";

/** Factor volumétrico aéreo 1:6000 → 167 kg por m³. */
export const KG_POR_M3_AEREO = 167;
const CENTESIMAS_POR_KG = 100;

/** Peso tasable: el mayor entre peso real y peso volumétrico. */
export function pesoTasable(pesoKg: number, volumenM3: number, factor = KG_POR_M3_AEREO): number {
  const real = Math.max(0, pesoKg || 0);
  const vol = Math.max(0, volumenM3 || 0) * factor;
  return Math.round(Math.max(real, vol) * CENTESIMAS_POR_KG) / CENTESIMAS_POR_KG;
}

export interface TramoPeso { desde_kg: number; precio: number }

/** Precio por kg del tramo aplicable (el mayor `desde_kg` ≤ peso). */
export function precioPorTramo(tramos: TramoPeso[], pesoKg: number, fleteBase: number): number {
  const aplicable = [...tramos]
    .filter((t) => t.desde_kg <= pesoKg)
    .sort((a, b) => b.desde_kg - a.desde_kg)[0];
  return aplicable ? aplicable.precio : fleteBase;
}

export interface CobroPeso { kgCobrados: number; precio: number }

/**
 * Regla "as higher weight" (IATA): si cobrar el inicio de un tramo superior
 * sale más barato que el tramo real, se cobra ese peso a ese precio.
 */
export function escalonMasBarato(tramos: TramoPeso[], pesoKg: number, fleteBase: number): CobroPeso {
  let mejor: CobroPeso = { kgCobrados: pesoKg, precio: precioPorTramo(tramos, pesoKg, fleteBase) };
  const costo = (c: CobroPeso) => Math.round(c.precio * c.kgCobrados * 100) / 100;
  for (const t of tramos) {
    if (!(t.desde_kg > pesoKg) || !(t.precio > 0)) continue;
    const cand = { kgCobrados: t.desde_kg, precio: t.precio };
    if (costo(cand) < costo(mejor)) mejor = cand;
  }
  return mejor;
}

/** Importe del flete por peso respetando el mínimo por embarque. */
export function fletePorPeso(tramos: TramoPeso[], pesoKg: number, fleteBase: number, minimo: number | null): number {
  const importe = subtotalLinea(pesoKg, precioPorTramo(tramos, pesoKg, fleteBase));
  return Math.max(importe, minimo ?? 0);
}

/**
 * Conceptos de recargo por modo, tomados del catálogo único de cargos.
 * Un concepto previo fuera del catálogo (p. ej. "BAF") se conserva tal cual.
 */
import type { BaseRecargo } from "@/features/costeo/types";
import { cargoPorCodigo, codigoDeConcepto, etiquetaCargo, recargosPorGrupo, type ModoCargo } from "./catalogoCargos";

export type ModoRecargo = ModoCargo;

/** Conceptos de textos anteriores al catálogo que se cobran una vez por embarque. */
const POR_EMBARQUE_PREVIOS = new Set(["BL", "Despacho", "AWB", "Cruce fronterizo", "Custodia"]);

export interface GrupoConceptos { grupo: string; nombre: string; conceptos: string[] }

export function gruposConceptosRecargo(modo: ModoRecargo = "Marítimo"): GrupoConceptos[] {
  return recargosPorGrupo(modo).map((g) => ({ grupo: g.grupo, nombre: g.nombre, conceptos: g.cargos.map(etiquetaCargo) }));
}

export function conceptosRecargoPorModo(modo: ModoRecargo = "Marítimo", actual?: string | null): string[] {
  const lista = gruposConceptosRecargo(modo).flatMap((g) => g.conceptos);
  return actual && !lista.includes(actual) ? [actual, ...lista] : lista;
}

export function baseSugerida(concepto: string): BaseRecargo {
  const cargo = cargoPorCodigo(codigoDeConcepto(concepto));
  if (cargo) return cargo.porEmbarque ? "por_embarque" : "por_unidad";
  return POR_EMBARQUE_PREVIOS.has(concepto) ? "por_embarque" : "por_unidad";
}

export const ETIQUETA_BASE_RECARGO: Record<BaseRecargo, string> = {
  por_unidad: "Por unidad",
  por_embarque: "Por embarque",
};

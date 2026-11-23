/**
 * Catálogo de conceptos de recargo sugeridos por modo de transporte y base de cobro.
 * Sólo sugiere: un concepto previo fuera del catálogo se conserva tal cual.
 */
import type { BaseRecargo } from "@/features/costeo/types";

export type ModoRecargo = "Marítimo" | "Aéreo" | "Terrestre";

const CATALOGO: Record<ModoRecargo, string[]> = {
  "Marítimo": ["BAF", "LSS", "ISPS", "THC Origen", "THC Destino", "BL", "Despacho", "Cargos en Origen", "Cargos en Destino", "Otro"],
  "Aéreo": ["FSC (combustible)", "SSC (seguridad)", "Manejo", "AWB", "Cargos en Origen", "Cargos en Destino", "Otro"],
  "Terrestre": ["FSC (combustible)", "Maniobras", "Cruce fronterizo", "Custodia", "Estadía", "Otro"],
};

/** Conceptos que normalmente se cobran una vez por embarque. */
const POR_EMBARQUE = new Set(["BL", "Despacho", "AWB", "Cruce fronterizo", "Custodia"]);

export function conceptosRecargoPorModo(modo: ModoRecargo = "Marítimo", actual?: string | null): string[] {
  const lista = CATALOGO[modo] ?? CATALOGO["Marítimo"];
  return actual && !lista.includes(actual) ? [actual, ...lista] : lista;
}

export function baseSugerida(concepto: string): BaseRecargo {
  return POR_EMBARQUE.has(concepto) ? "por_embarque" : "por_unidad";
}

export const ETIQUETA_BASE_RECARGO: Record<BaseRecargo, string> = {
  por_unidad: "Por unidad",
  por_embarque: "Por embarque",
};

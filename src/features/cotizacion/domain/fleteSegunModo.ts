/**
 * Nombre y unidad del flete base según el modo de la cotización.
 * Marítimo conserva el comportamiento histórico (FCL por contenedor, LCL por m³).
 * Aéreo cobra por kilo tasable y Terrestre por viaje.
 */
export interface FleteSegunModo {
  concepto: string;
  unidad: string;
}

export function fleteSegunModo(
  modo: string | null | undefined,
  tipoEmbarque: string | null | undefined,
  tipoContenedor: string | null | undefined,
): FleteSegunModo {
  if (modo === "Aéreo") return { concepto: "Flete aéreo", unidad: "kg" };
  if (modo === "Terrestre") return { concepto: "Flete terrestre", unidad: "viaje" };
  if (tipoEmbarque === "LCL") return { concepto: "Flete marítimo LCL", unidad: "m³" };
  return { concepto: `Flete marítimo (${tipoContenedor ?? ""})`.trim(), unidad: "contenedor" };
}

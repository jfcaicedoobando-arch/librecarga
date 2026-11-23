/** Tabulador oficial de comisiones de brokers (la base lo aplica; aquí sólo se muestra). */
export const TABULADOR_BROKER = [
  { servicio: "maritimo_fcl", nombre: "Flete marítimo FCL", unidad: "Contenedor", pct: 15, minimo: null },
  { servicio: "maritimo_lcl", nombre: "Flete marítimo LCL", unidad: "Embarque", pct: 15, minimo: 25 },
  { servicio: "aereo", nombre: "Flete aéreo", unidad: "Embarque", pct: 15, minimo: 25 },
  { servicio: "despacho_aduanal", nombre: "Despacho aduanal", unidad: "Servicio", pct: 15, minimo: 25 },
  { servicio: "terrestre_ftl", nombre: "Flete terrestre FTL", unidad: "Contenedor / viaje", pct: 10, minimo: 20 },
  { servicio: "terrestre_ltl", nombre: "Flete terrestre LTL", unidad: "Embarque", pct: 10, minimo: 20 },
] as const;

export const RETENCION_USD_POR_OPERACION = 150;

export interface ServicioDesglose {
  servicio: string; unidades: number; ganancia_usd: number; retencion_usd: number;
  base_usd: number; pct: number; minimo_usd: number; minimo_aplicado: boolean; comision_usd: number;
}

export function nombreServicio(servicio: string): string {
  return TABULADOR_BROKER.find((t) => t.servicio === servicio)?.nombre ?? servicio;
}

/** Lee el desglose guardado por la base; tolera renglones sin desglose. */
export function serviciosDesglose(desglose: unknown): ServicioDesglose[] {
  if (!desglose || typeof desglose !== "object") return [];
  const s = (desglose as { servicios?: unknown }).servicios;
  return Array.isArray(s) ? (s as ServicioDesglose[]) : [];
}

import { hoyMx } from "./mx";

/** Misma fecha efectiva que Pricing: carga futura o, en su ausencia, hoy en México. */
export function fechaVigenciaCarga(fechaCarga: string | null | undefined, hoy = hoyMx()): string {
  const fecha = fechaCarga?.slice(0, 10);
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return hoy;
  const instante = new Date(`${fecha}T00:00:00Z`);
  if (!Number.isFinite(instante.getTime()) || instante.toISOString().slice(0, 10) !== fecha) return hoy;
  return fecha > hoy ? fecha : hoy;
}

export function tarifaCubreCarga(
  tarifa: { vigente_desde?: string | null; vigente_hasta?: string | null }, fecha: string,
): boolean {
  return (!tarifa.vigente_desde || tarifa.vigente_desde <= fecha)
    && (!tarifa.vigente_hasta || tarifa.vigente_hasta >= fecha);
}
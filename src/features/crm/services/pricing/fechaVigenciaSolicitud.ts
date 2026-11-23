/**
 * Fecha contra la que se revisa la vigencia de una tarifa para una solicitud:
 * la fecha tentativa de carga; si falta, es inválida o ya pasó, se usa hoy.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function fechaVigenciaSolicitud(fechaCarga: string | null | undefined, hoy: string): string {
  const f = (fechaCarga ?? "").slice(0, 10);
  return ISO.test(f) && f > hoy ? f : hoy;
}

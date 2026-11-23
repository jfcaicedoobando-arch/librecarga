import { enTrabajo } from "./estadosPricing";

/**
 * Espejo en pantalla de `_crm_es_pricing` (la base es la que decide).
 */
const ROLES_PRICING = new Set(["ejecutivo_pricing", "gerente_operaciones", "admin_org", "admin", "super_admin"]);

export function esRolPricing(role: string | null | undefined): boolean {
  return !!role && ROLES_PRICING.has(role);
}

/** Quién puede agregar tarifas de respuesta: los mismos roles que `_crm_es_pricing`. */
const ROLES_TARIFA_RESPUESTA = new Set(["ejecutivo_pricing", "gerente_operaciones", "admin_org", "admin", "super_admin"]);

export function puedeAgregarTarifaRespuesta(role: string | null | undefined): boolean {
  return !!role && ROLES_TARIFA_RESPUESTA.has(role);
}

interface SolicitudPermiso {
  estado: string;
  created_by: string | null;
  solicitante_id: string | null;
}

/** Sólo mientras está abierta (borrador o en trabajo); cancelada, respondida y sin opción son terminales. */
export function solicitudAbierta(s: SolicitudPermiso): boolean {
  return s.estado === "borrador" || enTrabajo(s.estado);
}

export function esAutorSolicitud(s: SolicitudPermiso, userId: string | undefined): boolean {
  return !!userId && (s.created_by === userId || s.solicitante_id === userId);
}

export function puedeEditarSolicitud(s: SolicitudPermiso, userId: string | undefined, esPricing: boolean): boolean {
  return solicitudAbierta(s) && (esPricing || esAutorSolicitud(s, userId));
}

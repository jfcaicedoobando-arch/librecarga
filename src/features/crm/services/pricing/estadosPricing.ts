/**
 * Estados de trabajo de Pricing (Fase 5). La base decide las transiciones
 * (`crm_pricing_cambiar_estado`); aquí sólo se reflejan en pantalla.
 */
export const ESTADOS_EN_TRABAJO = ["enviada", "asignada", "en_proceso", "info_requerida"] as const;

/** Enviada y aún sin respuesta (incluye la pausa por información requerida). */
export function enTrabajo(estado: string): boolean {
  return (ESTADOS_EN_TRABAJO as readonly string[]).includes(estado);
}

/** El reloj corre en estos estados; en «Información requerida» se pausa. */
export function relojCorre(estado: string): boolean {
  return estado === "enviada" || estado === "asignada" || estado === "en_proceso";
}

export type AccionFlujoPricing = "tomar" | "iniciar" | "pedir_info" | "reanudar" | "sin_opcion";

interface SolicitudFlujo { estado: string; asignada_a: string | null; solicitante_id: string | null; created_by: string | null }

/** Acciones de trabajo disponibles, espejo de las reglas de la base. */
export function accionesDisponibles(s: SolicitudFlujo, userId: string | undefined, esPricing: boolean): AccionFlujoPricing[] {
  const acciones: AccionFlujoPricing[] = [];
  if (esPricing && s.estado === "enviada") acciones.push("tomar");
  if (esPricing && s.estado === "asignada" && s.asignada_a !== userId) acciones.push("tomar");
  if (esPricing && (s.estado === "enviada" || s.estado === "asignada")) acciones.push("iniciar");
  if (esPricing && relojCorre(s.estado)) acciones.push("pedir_info");
  const autor = !!userId && (s.solicitante_id === userId || s.created_by === userId);
  if (s.estado === "info_requerida" && (esPricing || autor)) acciones.push("reanudar");
  if (esPricing && enTrabajo(s.estado)) acciones.push("sin_opcion");
  return acciones;
}

/** Mínimo de caracteres del motivo por acción (igual que la base). */
export const MOTIVO_MINIMO: Partial<Record<AccionFlujoPricing, number>> = { pedir_info: 5, sin_opcion: 10 };

/** «Vencida» no es estado: se deriva del plazo mientras el reloj corre. */
export function estaVencida(s: { estado: string; vence_at: string | null }, ahora: Date): boolean {
  return relojCorre(s.estado) && !!s.vence_at && Date.parse(s.vence_at) < ahora.getTime();
}

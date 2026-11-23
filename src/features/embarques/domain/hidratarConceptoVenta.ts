/**
 * Hidratación pura de un renglón guardado de `conceptos_venta` al formato del
 * wizard de embarques. Extraído de `useHidratacionEditarEmbarque` para poder
 * probar el viaje completo lectura → edición → guardado sin montar el hook.
 */
import type { ConceptoVentaLocal } from "@/types/concepto";

export interface ConceptoVentaDbLike {
  id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number | string;
  moneda: string;
  contenedor_id: string | null;
  estado_facturacion?: string | null;
  aplica_iva?: boolean | null;
  tasa_iva_aplicada?: number | string | null;
  /** SAT 01 — `null` = fila legacy (se resuelve por flag + tasa). */
  tipo_iva?: string | null;
  evaluacion_fiscal?: ConceptoVentaLocal["evaluacionFiscal"];
  tasa_ret_isr?: number | string | null;
  monto_ret_isr?: number | string | null;
  tasa_ret_iva?: number | string | null;
  origen?: string | null;
  cotizacion_concepto_origen_id?: string | null;
}

export function mapConceptoVentaDbAFila(
  v: ConceptoVentaDbLike,
  indice: number,
): ConceptoVentaLocal {
  return {
    id: indice + 1,
    dbId: v.id, // v13.207.0 — preservamos UUID para merge en RPC
    concepto: v.descripcion,
    cantidad: v.cantidad,
    precioUnitario: Number(v.precio_unitario),
    moneda: v.moneda,
    contenedorId: v.contenedor_id ?? null,
    // Ola 5 — el estado viaja a la fila para bloquear la edición fantasma
    // de conceptos ya facturados (la RPC los descarta en silencio).
    estadoFacturacion: v.estado_facturacion ?? null,
    // R179-01 — Se preservan los valores fiscales guardados (flags `false`
    // y tasas explícitas 0/0.08/0.16). Nunca se re-resuelven por nombre ni
    // se sobrescriben al cambiar moneda o recargar.
    aplicaIva: v.aplica_iva ?? null,
    tasaIva: v.tasa_iva_aplicada == null ? null : Number(v.tasa_iva_aplicada),
    // SAT 01 — tratamiento explícito tal cual; `null` = legacy.
    tipoIva: v.tipo_iva ?? null,
    evaluacionFiscal: v.evaluacion_fiscal ?? null,
    tasaRetIsr: v.tasa_ret_isr == null ? null : Number(v.tasa_ret_isr),
    montoRetIsr: v.monto_ret_isr == null ? null : Number(v.monto_ret_isr),
    tasaRetIva: v.tasa_ret_iva == null ? null : Number(v.tasa_ret_iva),
    origen: v.origen ?? null,
    cotizacionConceptoOrigenId: v.cotizacion_concepto_origen_id ?? null,
  };
}

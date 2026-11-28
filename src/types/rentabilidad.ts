/**
 * Tipo de resumen de rentabilidad por cliente (módulo Reportes).
 */

export interface RentabilidadCliente {
  cliente_id: string;
  cliente_nombre: string;
  total_embarques: number;
  venta_usd: number;
  costo_usd: number;
  profit_usd: number;
  margen: number;
  /** DEFECTO 8: embarques de este cliente con al menos un concepto sin TC. */
  embarques_sin_tc: number;
}

/** Base del reporte, compartida por pantalla y PDF. */
export const METODOLOGIA_RENTABILIDAD = "El filtro de periodo usa la fecha efectiva de entrega confirmada. Compara ventas facturadas netas de notas de crédito y costos operativos del embarque, sin impuestos. Consulta Cierre mensual para la proyección y el pendiente de facturar.";

export const DESCRIPCION_RENTABILIDAD = "Periodo por fecha efectiva de entrega confirmada. Ventas facturadas netas de notas de crédito y costos operativos, sin impuestos.";
export const AVISO_RENTABILIDAD = "No incluye ventas pendientes de facturar. Una venta en cero no representa necesariamente una pérdida definitiva.";
export const AYUDA_CAMBIARIA_RENTABILIDAD = "Las ventas se convierten a MXN con el tipo de cambio de cada factura. Los costos y la conversión final a USD usan el tipo de cambio del embarque; si falta, el DOF vigente a su ETA.";
export const BASE_CSV_RENTABILIDAD = "Ventas facturadas netas de NC; costos operativos; sin impuestos";
export const VACIO_RENTABILIDAD = "No hay entregas confirmadas en este periodo y modo";

/**
 * Costo cotizado vs real (sólo lectura): agrupa por solicitud lo que devuelve
 * `crm_pricing_costo_vs_real`. Nunca suma monedas distintas.
 */
import { roundMoney } from "@/lib/financial/financialUtils";

export interface FilaCostoReal {
  solicitud_id: string; cotizacion_id: string; cotizacion_folio: string;
  embarque_id: string | null; expediente: string | null; moneda: string | null;
  costo_cotizado: number; costo_real: number; facturas: number;
}
export interface MonedaCostoReal { moneda: string; cotizado: number; real: number; diferencia: number; pct: number | null }
export type EstadoCostoReal = "sin_cotizacion" | "sin_embarque" | "esperando_facturas" | "con_resultado";
export interface ResumenCostoReal {
  estado: EstadoCostoReal; cotizacionFolio: string | null; expediente: string | null; monedas: MonedaCostoReal[];
}

const r2 = roundMoney;

/** Diferencia = real − cotizado (positivo = costó más de lo cotizado). */
export function compararMoneda(moneda: string, cotizado: number, real: number): MonedaCostoReal {
  const diferencia = r2(real - cotizado);
  return { moneda, cotizado: r2(cotizado), real: r2(real), diferencia, pct: cotizado > 0 ? r2((diferencia / cotizado) * 100) : null };
}

export function resumirCostoReal(filas: FilaCostoReal[]): ResumenCostoReal {
  if (!filas.length) return { estado: "sin_cotizacion", cotizacionFolio: null, expediente: null, monedas: [] };
  const conEmbarque = filas.filter((f) => f.embarque_id);
  const base = conEmbarque[0] ?? filas[0];
  if (!conEmbarque.length) return { estado: "sin_embarque", cotizacionFolio: base.cotizacion_folio, expediente: null, monedas: [] };
  const delEmbarque = conEmbarque.filter((f) => f.cotizacion_id === base.cotizacion_id && f.moneda);
  const monedas = delEmbarque.map((f) => compararMoneda(f.moneda as string, Number(f.costo_cotizado), Number(f.costo_real)));
  const facturas = delEmbarque.reduce((n, f) => n + f.facturas, 0);
  return { estado: facturas > 0 ? "con_resultado" : "esperando_facturas", cotizacionFolio: base.cotizacion_folio, expediente: base.expediente, monedas };
}

export function agruparPorSolicitud(filas: FilaCostoReal[]): Map<string, ResumenCostoReal> {
  const grupos = new Map<string, FilaCostoReal[]>();
  for (const f of filas) grupos.set(f.solicitud_id, [...(grupos.get(f.solicitud_id) ?? []), f]);
  return new Map([...grupos].map(([id, g]) => [id, resumirCostoReal(g)]));
}

export const ETIQUETA_ESTADO_COSTO: Record<EstadoCostoReal, string> = {
  sin_cotizacion: "Sin cotización", sin_embarque: "Sin embarque",
  esperando_facturas: "Esperando facturas", con_resultado: "Con facturas",
};

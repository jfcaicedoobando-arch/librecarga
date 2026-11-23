/**
 * Construye filas de costos internos (P&L) a partir de una tarifa marítima
 * vinculada. v13.35.0 — política tarifa-first.
 *
 *  - Genera 1 fila por flete base (concepto "Flete marítimo").
 *  - Genera 1 fila por recargo (BAF, LSS, ISPS, Cargos en Origen/Destino, etc.).
 *  - Aplica un markup configurable a `precio_venta` (default 15%).
 *  - Moneda del recargo (USD/MXN); otra moneda se rechaza en vez de etiquetarse USD.
 *  - Recargo `por_embarque` va con cantidad 1; `por_unidad` × contenedores/m³.
 *
 * No hace I/O. Sólo transforma datos. El llamador decide si remplaza o
 * agrega a `costosInternos`.
 */
import type { FilaCostoLocal } from "@/features/cotizacion/types";
import type { TopTarifaRow, CosteoTarifaRecargo } from "@/features/costeo/types";
import { roundMoney } from "@/lib/financial/financialUtils";
import { NOTA_AUTO_TARIFA } from "./costosAutoGenerados";
import { fleteSegunModo } from "./fleteSegunModo";

export interface BuildCostosDesdeTarifaArgs {
  tarifa: Pick<
    TopTarifaRow,
    "id" | "flete_base" | "naviera_nombre" | "tipo_contenedor_nombre"
  >;
  recargos: CosteoTarifaRecargo[];
  /** Markup decimal aplicado a costo para sugerir precio_venta (0.15 = 15%). */
  markup: number;
  /** Cantidad por defecto, normalmente número de contenedores. */
  cantidad?: number;
  /** Tipo de embarque de la cotización (FCL/LCL). Cambia unidad de medida y label del flete. */
  tipoEmbarque?: "FCL" | "LCL" | string | null;
  /** Modo de la cotización; decide nombre y unidad del flete (default Marítimo). */
  modo?: string | null;
}

const aplicarMarkup = (costo: number, markup: number): number => {
  if (!Number.isFinite(costo) || costo <= 0) return 0;
  const factor = 1 + (Number.isFinite(markup) && markup >= 0 ? markup : 0);
  return roundMoney(costo * factor);
};

/** Moneda real del recargo; los costos de cotización sólo admiten USD y MXN. */
export function monedaRecargo(r: Pick<CosteoTarifaRecargo, "moneda" | "concepto">): "USD" | "MXN" {
  const m = (r.moneda ?? "USD").toUpperCase();
  if (m === "USD" || m === "MXN") return m;
  throw new Error(`El recargo ${r.concepto} está en ${m}; las cotizaciones sólo manejan USD y MXN. Corrige la tarifa antes de cotizar.`);
}

/** Diferencia para llegar al mínimo del recargo (0 si el cargo real ya lo alcanza). */
export function ajusteMinimoRecargo(minimo: number | null | undefined, monto: number, cantidad: number): number {
  const min = Number(minimo ?? 0);
  if (!(min > 0)) return 0;
  const diferencia = roundMoney(min - roundMoney(monto * cantidad));
  return diferencia > 0 ? diferencia : 0;
}

/** Filas de costo derivadas de los recargos de la tarifa (B-073: con linkage). */
export function filasDesdeRecargos({
  recargos,
  tarifaId,
  proveedor,
  qty,
  unidad,
  markup,
}: {
  recargos: BuildCostosDesdeTarifaArgs["recargos"];
  tarifaId: string | null;
  proveedor: string;
  qty: number;
  unidad: string;
  markup: number;
}): FilaCostoLocal[] {
  const filas: FilaCostoLocal[] = [];
  for (const r of recargos) {
    const monto = Number(r.monto ?? 0);
    if (monto <= 0) continue;
    const moneda = monedaRecargo(r);
    const porEmbarque = r.base === "por_embarque";
    const ladoTxt = r.lado ? ` (${r.lado})` : "";
    const cantidad = porEmbarque ? 1 : qty;
    const proveedorFila = r.proveedor?.trim() || proveedor;
    filas.push({
      concepto: `${r.concepto}${ladoTxt}`,
      moneda,
      proveedor: proveedorFila,
      cantidad,
      costo_unitario: monto,
      precio_venta: aplicarMarkup(monto, markup),
      unidad_medida: porEmbarque ? "embarque" : unidad,
      aplica_iva: false,
      notas: NOTA_AUTO_TARIFA,
      // B-073: linkage tarifa + recargo (la RPC compara recargo por recargo).
      costeo_tarifa_id: tarifaId,
      costeo_tarifa_recargo_id: r.id ?? null,
    });
    const ajuste = ajusteMinimoRecargo(r.minimo, monto, cantidad);
    if (ajuste > 0) {
      // Fila aparte y sin linaje: la revalidación compara cada recargo contra su monto unitario.
      filas.push({
        concepto: `Ajuste a mínimo · ${r.concepto}${ladoTxt}`, moneda, proveedor: proveedorFila,
        cantidad: 1, costo_unitario: ajuste, precio_venta: aplicarMarkup(ajuste, markup),
        unidad_medida: "embarque", aplica_iva: false, notas: NOTA_AUTO_TARIFA,
        costeo_tarifa_id: null, costeo_tarifa_recargo_id: null,
      });
    }
  }
  return filas;
}

export function buildCostosDesdeTarifa({
  tarifa,
  recargos,
  markup,
  cantidad = 1,
  tipoEmbarque,
  modo = "Marítimo",
}: BuildCostosDesdeTarifaArgs): FilaCostoLocal[] {
  const filas: FilaCostoLocal[] = [];
  const proveedor = tarifa.naviera_nombre ?? "";
  // LCL por m³, FCL por contenedor (AUD-LCL-1); Aéreo por kg; Terrestre por viaje.
  const { concepto: conceptoFlete, unidad } = fleteSegunModo(modo, tipoEmbarque, tarifa.tipo_contenedor_nombre);

  // 13.142.8: la BD tiene un check `cotizacion_costos_cantidad_pos` que exige
  // `cantidad > 0`. Cuando el wizard aún no captura contenedores llega 0 y la
  // inserción explota. Normalizamos siempre a mínimo 1.
  const qty = Number.isFinite(cantidad) && cantidad >= 1 ? cantidad : 1;

  const fleteBase = Number(tarifa.flete_base ?? 0);
  if (fleteBase > 0) {
    filas.push({
      concepto: conceptoFlete,
      moneda: "USD",
      proveedor,
      cantidad: qty,
      costo_unitario: fleteBase,
      precio_venta: aplicarMarkup(fleteBase, markup),
      unidad_medida: unidad,
      aplica_iva: false,
      notas: NOTA_AUTO_TARIFA,
      // B-073: la fila de flete queda ligada a la tarifa para revalidar precio.
      costeo_tarifa_id: tarifa.id ?? null,
    });
  }

  filas.push(
    ...filasDesdeRecargos({ recargos, tarifaId: tarifa.id ?? null, proveedor, qty, unidad, markup }),
  );

  return filas;
}


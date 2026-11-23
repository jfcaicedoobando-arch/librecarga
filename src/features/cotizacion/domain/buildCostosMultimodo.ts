/** Filas de costo desde una tarifa aérea/terrestre: flete real + recargos. */
import type { FilaCostoLocal } from "@/features/cotizacion/types";
import type { CosteoTarifaRecargo } from "@/features/costeo/types";
import { roundMoney } from "@/lib/financial/financialUtils";
import { NOTA_AUTO_TARIFA } from "./costosAutoGenerados";
import { filasDesdeRecargos, monedaRecargo } from "./buildCostosDesdeTarifa";
import { fleteMultimodo, type TarifaMultimodoCosteo } from "./fleteMultimodo";

export function buildCostosMultimodo(args: {
  tarifa: TarifaMultimodoCosteo;
  recargos: CosteoTarifaRecargo[];
  markup: number;
  carga: { pesoKg: number; volumenM3: number; viajes: number };
}): FilaCostoLocal[] {
  const { tarifa, recargos, markup, carga } = args;
  const factor = 1 + (Number.isFinite(markup) && markup >= 0 ? markup : 0);
  const flete = fleteMultimodo(tarifa, carga);
  const filas: FilaCostoLocal[] = [];
  if (flete) {
    filas.push({
      concepto: tarifa.modo === "Aéreo" ? "Flete aéreo" : "Flete terrestre",
      moneda: monedaRecargo({ moneda: tarifa.moneda, concepto: "Flete" } as CosteoTarifaRecargo),
      proveedor: tarifa.proveedor,
      cantidad: flete.cantidad,
      costo_unitario: flete.costo_unitario,
      precio_venta: roundMoney(flete.costo_unitario * factor),
      unidad_medida: flete.unidad,
      aplica_iva: false,
      notas: NOTA_AUTO_TARIFA,
      costeo_tarifa_id: tarifa.id,
    });
  }
  const qty = flete && flete.unidad !== "embarque" ? flete.cantidad : 1;
  const unidad = flete && flete.unidad !== "embarque" ? flete.unidad : "embarque";
  filas.push(...filasDesdeRecargos({ recargos, tarifaId: tarifa.id, proveedor: tarifa.proveedor, qty, unidad, markup }));
  return filas;
}

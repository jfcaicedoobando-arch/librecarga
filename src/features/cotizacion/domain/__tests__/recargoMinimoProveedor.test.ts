import { describe, it, expect } from "vitest";
import { ajusteMinimoRecargo, filasDesdeRecargos } from "../buildCostosDesdeTarifa";
import type { CosteoTarifaRecargo } from "@/features/costeo/types";

const rec = (p: Partial<CosteoTarifaRecargo>): CosteoTarifaRecargo => ({
  id: "r1", tarifa_id: "t1", concepto: "SUR-FSA · Combustible", lado: "origen", monto: 0.85,
  moneda: "USD", incluido_en_total: true, base: "por_unidad", ...p,
});
const filas = (r: CosteoTarifaRecargo, qty: number) =>
  filasDesdeRecargos({ recargos: [r], tarifaId: "t1", proveedor: "Aerolínea", qty, unidad: "kg", markup: 0 });

describe("mínimo y proveedor por recargo", () => {
  it("20 kg × 0.85 con mínimo 50 agrega ajuste de 33", () => {
    const f = filas(rec({ minimo: 50 }), 20);
    expect(f).toHaveLength(2);
    expect(f[1].costo_unitario).toBe(33);
    expect(f[1].costeo_tarifa_recargo_id).toBeNull();
  });
  it("sin ajuste cuando el cargo real supera el mínimo", () => {
    expect(ajusteMinimoRecargo(50, 0.85, 100)).toBe(0);
    expect(filas(rec({ minimo: 50 }), 100)).toHaveLength(1);
  });
  it("usa el proveedor del recargo y si falta el de la tarifa", () => {
    expect(filas(rec({ proveedor: "Handling MEX" }), 10)[0].proveedor).toBe("Handling MEX");
    expect(filas(rec({ proveedor: null }), 10)[0].proveedor).toBe("Aerolínea");
  });
});

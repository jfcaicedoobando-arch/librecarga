import { describe, expect, it } from "vitest";
import { fleteMultimodo, type TarifaMultimodoCosteo } from "../fleteMultimodo";

const aereo: TarifaMultimodoCosteo = {
  id: "t1", modo: "Aéreo", flete_base: 5, minimo: 150, unidad_flete: "kg", moneda: "USD", proveedor: "AM",
  tramos: [{ desde_kg: 45, precio: 4 }, { desde_kg: 100, precio: 3.5 }],
};

describe("fleteMultimodo", () => {
  it("aéreo usa el rango del peso tasable", () => {
    // 200 kg reales vs 1 m³ × 167 = 167 → tasable 200, rango +100 = 3.5
    expect(fleteMultimodo(aereo, { pesoKg: 200, volumenM3: 1, viajes: 1 })).toMatchObject({ cantidad: 200, costo_unitario: 3.5, unidad: "kg" });
  });
  it("aéreo cobra el volumétrico si es mayor", () => {
    expect(fleteMultimodo(aereo, { pesoKg: 50, volumenM3: 1, viajes: 1 })?.cantidad).toBe(167);
  });
  it("aplica el mínimo por embarque", () => {
    expect(fleteMultimodo(aereo, { pesoKg: 20, volumenM3: 0, viajes: 1 })).toMatchObject({ cantidad: 1, costo_unitario: 150, unidad: "embarque" });
  });
  it("terrestre por viaje multiplica por viajes", () => {
    const ftl = { ...aereo, modo: "Terrestre" as const, unidad_flete: "viaje", flete_base: 18000, tramos: [] };
    expect(fleteMultimodo(ftl, { pesoKg: 0, volumenM3: 0, viajes: 2 })).toMatchObject({ cantidad: 2, costo_unitario: 18000, unidad: "viaje" });
  });
  it("sin peso no inventa flete por kg", () => {
    expect(fleteMultimodo(aereo, { pesoKg: 0, volumenM3: 0, viajes: 1 })).toBeNull();
  });
});

describe("recargos por kilo con mínimo aplicado", () => {
  it("20 kg con mínimo de 150 cobra combustible 0.85 × 20 kg, no una sola vez", async () => {
    const { buildCostosMultimodo } = await import("../buildCostosMultimodo");
    const tarifa = { id: "t", modo: "Aéreo" as const, flete_base: 6.5, minimo: 150, unidad_flete: "kg", moneda: "USD", proveedor: "P", tramos: [] };
    const recargos = [
      { id: "r1", concepto: "FSC", lado: "origen", monto: 0.85, moneda: "USD", base: "por_unidad" },
      { id: "r2", concepto: "AWB", lado: "origen", monto: 50, moneda: "USD", base: "por_embarque" },
    ] as never;
    const f = buildCostosMultimodo({ tarifa, recargos, markup: 0, carga: { pesoKg: 20, volumenM3: 0, viajes: 1 } });
    expect(f[0]).toMatchObject({ cantidad: 1, costo_unitario: 150, unidad_medida: "embarque" });
    expect(f[1]).toMatchObject({ cantidad: 20, costo_unitario: 0.85, unidad_medida: "kg" });
    expect(f[2]).toMatchObject({ cantidad: 1, unidad_medida: "embarque" });
  });
});

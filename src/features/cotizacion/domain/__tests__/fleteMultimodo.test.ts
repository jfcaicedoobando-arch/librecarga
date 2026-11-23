import { describe, expect, it } from "vitest";
import { fleteMultimodo, type TarifaMultimodoCosteo } from "../fleteMultimodo";

const aereo: TarifaMultimodoCosteo = {
  id: "t1", modo: "Aéreo", flete_base: 5, minimo: 150, unidad_flete: "kg", moneda: "USD", proveedor: "AM",
  tramos: [{ desde_kg: 45, precio: 4 }, { desde_kg: 100, precio: 3.5 }],
};

describe("fleteMultimodo", () => {
  it("aéreo usa el rango del peso tasable", () => {
    // 200 kg reales vs 1 m³ × 167 = 167 → tasable 200, rango +100 = 3.5
    expect(fleteMultimodo(aereo, { pesoKg: 200, volumenM3: 1, viajes: 1 })).toEqual({ cantidad: 200, costo_unitario: 3.5, unidad: "kg" });
  });
  it("aéreo cobra el volumétrico si es mayor", () => {
    expect(fleteMultimodo(aereo, { pesoKg: 50, volumenM3: 1, viajes: 1 })?.cantidad).toBe(167);
  });
  it("aplica el mínimo por embarque", () => {
    expect(fleteMultimodo(aereo, { pesoKg: 20, volumenM3: 0, viajes: 1 })).toEqual({ cantidad: 1, costo_unitario: 150, unidad: "embarque" });
  });
  it("conserva el cobro por kg si el subtotal redondeado empata el mínimo", () => {
    const tarifa = { ...aereo, flete_base: 10.075, minimo: 10.08, tramos: [] };
    const resultado = fleteMultimodo(tarifa, { pesoKg: 1, volumenM3: 0, viajes: 1 });
    expect(resultado).toEqual({ cantidad: 1, costo_unitario: 10.075, unidad: "kg" });
  });
  it("terrestre por viaje multiplica por viajes", () => {
    const ftl = { ...aereo, modo: "Terrestre" as const, unidad_flete: "viaje", flete_base: 18000, tramos: [] };
    expect(fleteMultimodo(ftl, { pesoKg: 0, volumenM3: 0, viajes: 2 })).toEqual({ cantidad: 2, costo_unitario: 18000, unidad: "viaje" });
  });
  it("sin peso no inventa flete por kg", () => {
    expect(fleteMultimodo(aereo, { pesoKg: 0, volumenM3: 0, viajes: 1 })).toBeNull();
  });
});

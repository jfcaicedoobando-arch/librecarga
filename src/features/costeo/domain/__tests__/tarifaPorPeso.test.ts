import { describe, it, expect } from "vitest";
import { pesoTasable, precioPorTramo, fletePorPeso } from "../tarifaPorPeso";

const tramos = [{ desde_kg: 45, precio: 3 }, { desde_kg: 100, precio: 2.5 }, { desde_kg: 300, precio: 2 }];

describe("tarifa por peso", () => {
  it("usa el volumétrico 167 kg/m³ cuando supera al real", () => {
    expect(pesoTasable(100, 1)).toBe(167);
    expect(pesoTasable(200, 1)).toBe(200);
  });
  it("aplica el tramo mayor que no excede el peso", () => {
    expect(precioPorTramo(tramos, 150, 4)).toBe(2.5);
    expect(precioPorTramo(tramos, 20, 4)).toBe(4);
  });
  it("respeta el mínimo por embarque", () => {
    expect(fletePorPeso(tramos, 20, 4, 100)).toBe(100);
    expect(fletePorPeso(tramos, 300, 4, 100)).toBe(600);
  });
  it("redondea los importes de flete según la política monetaria", () => {
    expect(fletePorPeso([], 1, 10.075, null)).toBe(10.08);
  });
});

import { describe, it, expect } from "vitest";
import { pesoTasable, precioPorTramo, fletePorPeso, escalonMasBarato } from "../tarifaPorPeso";

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

describe("escalón más barato (as higher weight)", () => {
  const t = [{ desde_kg: 45, precio: 6 }, { desde_kg: 100, precio: 5 }];
  it("95 kg a 6.00 (570) se cobra como 100 kg a 5.00 (500)", () => {
    expect(escalonMasBarato(t, 95, 7)).toEqual({ kgCobrados: 100, precio: 5 });
  });
  it("con 45 kg exactos queda en su propio tramo", () => {
    expect(escalonMasBarato(t, 45, 7)).toEqual({ kgCobrados: 45, precio: 6 });
  });
  it("60 kg no sube porque 360 < 500", () => {
    expect(escalonMasBarato(t, 60, 7)).toEqual({ kgCobrados: 60, precio: 6 });
  });
});

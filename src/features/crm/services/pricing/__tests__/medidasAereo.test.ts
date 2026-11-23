import { describe, expect, it } from "vitest";
import { leerDimensiones, pesoTasableSolicitud, textoDimensiones, volumenBultosM3 } from "../medidasAereo";

const m = { bultos: 2, largo: 120, ancho: 80, alto: 100 };
describe("medidas aéreas", () => {
  it("calcula volumen de los bultos en m³", () => {
    expect(volumenBultosM3(m)).toBe(1.92);
    expect(volumenBultosM3({ ...m, alto: null })).toBeNull();
  });
  it("guarda y lee el texto de dimensiones", () => {
    expect(leerDimensiones(textoDimensiones(m))).toEqual(m);
  });
  it("peso tasable usa el mayor entre real y 167 kg/m³", () => {
    expect(pesoTasableSolicitud("250", "kg", 2)).toBe(334);
    expect(pesoTasableSolicitud("500", "kg", 2)).toBe(500);
    expect(pesoTasableSolicitud("250", null, 2)).toBeNull();
  });
});

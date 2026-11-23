import { describe, expect, it } from "vitest";
import { leerDimensiones, leerDimensionesLineas, pesoTasableSolicitud, textoDimensiones, textoDimensionesLineas, totalBultos, volumenBultosM3, volumenLineasM3 } from "../medidasAereo";

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

describe("carga mixta (varias líneas de bultos)", () => {
  const ls = [{ bultos: 2, largo: 100, ancho: 100, alto: 100 }, { bultos: 5, largo: 40, ancho: 40, alto: 40 }];
  it("2 tarimas de 1 m³ + 5 cajas de 40 cm suman 2.32 m³ y 7 bultos", () => {
    expect(volumenLineasM3(ls)).toBe(2.32);
    expect(totalBultos(ls)).toBe(7);
  });
  it("guarda y vuelve a leer las dos líneas", () => {
    const t = textoDimensionesLineas(ls);
    expect(t).toBe("2 bulto(s) de 100×100×100 cm; 5 bulto(s) de 40×40×40 cm");
    expect(leerDimensionesLineas(t)).toEqual(ls);
  });
  it("una línea incompleta deja el volumen sin calcular", () => {
    expect(volumenLineasM3([ls[0], { bultos: 1, largo: null, ancho: 10, alto: 10 }])).toBeNull();
  });
});

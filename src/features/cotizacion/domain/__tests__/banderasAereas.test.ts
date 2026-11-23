import { describe, expect, it } from "vitest";
import { itemsBanderasAereas } from "../banderasAereas";

describe("itemsBanderasAereas", () => {
  it("muestra las tres banderas con texto para el cliente", () => {
    expect(itemsBanderasAereas({ baterias_litio: true, known_shipper: false, tipo_aeronave: "CAO" })).toEqual([
      ["Baterías de litio", "Sí"], ["Expedidor conocido (Known Shipper)", "No"], ["Tipo de avión", "CAO (sólo carguero)"],
    ]);
  });
  it("omite las respuestas vacías", () => {
    expect(itemsBanderasAereas({ baterias_litio: null, known_shipper: null, tipo_aeronave: null })).toEqual([]);
    expect(itemsBanderasAereas(null)).toEqual([]);
  });
});

import { columnasBanderasAereas } from "../banderasAereas";
describe("columnasBanderasAereas", () => {
  const b = { baterias_litio: true, known_shipper: true, tipo_aeronave: "PAX" };
  it("guarda las banderas sólo en aéreo", () => {
    expect(columnasBanderasAereas(true, b)).toEqual(b);
    expect(columnasBanderasAereas(false, b)).toEqual({ baterias_litio: null, known_shipper: null, tipo_aeronave: null });
  });
});

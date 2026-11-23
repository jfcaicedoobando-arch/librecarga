import { describe, expect, it } from "vitest";
import { iataDeEtiqueta } from "../tarifasAereasSugeridas";

describe("iataDeEtiqueta", () => {
  it("lee el código de la etiqueta del buscador", () => {
    expect(iataDeEtiqueta("PVG — Shanghai Pudong, Shanghai")).toBe("PVG");
    expect(iataDeEtiqueta("mex")).toBe("MEX");
  });
  it("no inventa código con texto libre o vacío", () => {
    expect(iataDeEtiqueta("Shanghai")).toBeNull();
    expect(iataDeEtiqueta(null)).toBeNull();
  });
});

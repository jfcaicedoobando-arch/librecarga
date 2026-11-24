import { describe, it, expect } from "vitest";
import { textoEscalas, itemEscalas } from "../escalasVuelo";

describe("escalas del vuelo", () => {
  it("sin tarifa no muestra nada", () => expect(itemEscalas(undefined)).toEqual([]));
  it("tarifa sin escalas es vuelo directo", () => {
    expect(textoEscalas(null)).toBe("Vuelo directo");
    expect(textoEscalas([])).toBe("Vuelo directo");
  });
  it("lista las escalas en orden", () => expect(itemEscalas(["lax", "ANC"])).toEqual([["Escalas", "LAX → ANC"]]));
});

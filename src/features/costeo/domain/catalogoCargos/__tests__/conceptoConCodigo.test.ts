import { describe, it, expect } from "vitest";
import { conceptoConCodigo } from "../conceptoConCodigo";

describe("conceptoConCodigo", () => {
  it("conserva textos que ya traen código", () => {
    expect(conceptoConCodigo("SUR-BAF · Recargo")).toBe("SUR-BAF · Recargo");
  });
  it("pone código a los fletes base", () => {
    expect(conceptoConCodigo("Flete aéreo")).toBe("FRT-AF · Flete aéreo");
    expect(conceptoConCodigo("Flete marítimo (40HC)")).toBe("FRT-OF · Flete marítimo (40HC)");
    expect(conceptoConCodigo("Flete terrestre")).toBe("FRT-LH · Flete terrestre");
  });
  it("deja igual un texto que no está en el catálogo", () => {
    expect(conceptoConCodigo("Servicio especial XYZ")).toBe("Servicio especial XYZ");
  });
});

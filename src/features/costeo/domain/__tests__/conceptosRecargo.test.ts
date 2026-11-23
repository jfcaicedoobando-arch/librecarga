import { describe, expect, it } from "vitest";
import { baseSugerida, conceptosRecargoPorModo } from "../conceptosRecargo";

describe("catálogo de recargos por modo", () => {
  it("cada modo sugiere sus conceptos", () => {
    expect(conceptosRecargoPorModo("Aéreo")).toContain("AWB");
    expect(conceptosRecargoPorModo("Terrestre")).toContain("Cruce fronterizo");
    expect(conceptosRecargoPorModo("Marítimo")).toContain("BAF");
  });
  it("conserva un concepto previo fuera del catálogo", () => {
    expect(conceptosRecargoPorModo("Marítimo", "Fumigación")[0]).toBe("Fumigación");
  });
  it("BL y AWB se sugieren por embarque; BAF por unidad", () => {
    expect(baseSugerida("BL")).toBe("por_embarque");
    expect(baseSugerida("AWB")).toBe("por_embarque");
    expect(baseSugerida("BAF")).toBe("por_unidad");
  });
});

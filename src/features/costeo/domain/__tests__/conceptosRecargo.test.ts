import { describe, expect, it } from "vitest";
import { baseSugerida, conceptosRecargoPorModo, gruposConceptosRecargo } from "../conceptosRecargo";
import { CATALOGO_CARGOS, codigoDeConcepto } from "../catalogoCargos";

describe("catálogo único de cargos", () => {
  it("tiene códigos únicos con formato GRUPO-CONCEPTO", () => {
    const codigos = CATALOGO_CARGOS.map((c) => c.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(codigos.every((c) => /^[A-Z]{3}-[A-Z]{2,4}$/.test(c))).toBe(true);
    expect(codigos.length).toBe(121);
  });
  it("ofrece recargos por modo con código y sin fletes base", () => {
    expect(conceptosRecargoPorModo("Marítimo")).toContain("SUR-BAF · Recargo por combustible marítimo");
    expect(conceptosRecargoPorModo("Aéreo")).toContain("SUR-FSA · Recargo por combustible aéreo");
    expect(conceptosRecargoPorModo("Aéreo")).not.toContain("SUR-BAF · Recargo por combustible marítimo");
    expect(conceptosRecargoPorModo("Marítimo").some((c) => c.startsWith("FRT-OF"))).toBe(false);
    expect(gruposConceptosRecargo("Terrestre").map((g) => g.grupo)).toContain("INL");
  });
  it("conserva un concepto previo fuera del catálogo", () => {
    expect(conceptosRecargoPorModo("Marítimo", "Fumigación")[0]).toBe("Fumigación");
  });
  it("sugiere la base de cobro del catálogo y de textos previos", () => {
    expect(baseSugerida("DOC-BL · Emisión de BL")).toBe("por_embarque");
    expect(baseSugerida("SUR-BAF · Recargo por combustible marítimo")).toBe("por_unidad");
    expect(baseSugerida("AWB")).toBe("por_embarque");
    expect(baseSugerida("BAF")).toBe("por_unidad");
  });
  it("lee el código de un texto guardado", () => {
    expect(codigoDeConcepto("SUR-BAF · Recargo por combustible marítimo")).toBe("SUR-BAF");
    expect(codigoDeConcepto("BAF")).toBeNull();
  });
  it.each(["Marítimo", "Aéreo", "Terrestre"] as const)("ofrece cuatro totales agrupados por embarque en %s", (modo) => {
    const conceptos = gruposConceptosRecargo(modo).find((g) => g.grupo === "AGR")?.conceptos;
    expect(conceptos).toEqual([
      "AGR-ON · Cargos en origen Naviera", "AGR-OA · Cargos en origen Agente",
      "AGR-DN · Cargos en destino Naviera", "AGR-DA · Cargos en destino Agente",
    ]);
    for (const concepto of conceptos ?? []) expect(baseSugerida(concepto)).toBe("por_embarque");
  });
});

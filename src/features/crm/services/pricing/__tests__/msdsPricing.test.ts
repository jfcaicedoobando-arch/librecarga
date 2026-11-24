import { describe, expect, it } from "vitest";
import { esMsdsPricing, faltaMsdsPricing, prepararMsdsPricing } from "../msdsPricing";

describe("MSDS obligatoria para carga peligrosa", () => {
  it("bloquea IMO Sí sin MSDS, incluso con otros PDF", () => {
    expect(faltaMsdsPricing(true, [])).toBe(true);
    expect(faltaMsdsPricing(true, ["factura.pdf", "MSDS-hoja.png"])).toBe(true);
    expect(faltaMsdsPricing(true, ["MSDS-hoja.pdf"])).toBe(false);
  });
  it("no exige MSDS cuando IMO no es Sí", () => {
    expect(faltaMsdsPricing(false, [])).toBe(false);
    expect(faltaMsdsPricing(null, [])).toBe(false);
  });
  it("reconoce la identificación antes y después de subir", () => {
    expect(esMsdsPricing("1795489200000-MSDS-hoja.pdf")).toBe(true);
    expect(esMsdsPricing("factura.pdf")).toBe(false);
  });
  it("identifica un PDF real y rechaza un archivo renombrado", async () => {
    // File de node dispone de arrayBuffer, a diferencia del polyfill de jsdom.
    const { File: NodeFile } = await import("node:buffer");
    const pdf = new NodeFile(["%PDF-1.7\ncontenido"], "hoja.pdf", { type: "application/pdf" });
    const result = await prepararMsdsPricing(pdf as File);
    expect(result.name).toBe("MSDS-hoja.pdf");
    expect(result.type).toBe("application/pdf");
    await expect(prepararMsdsPricing(new NodeFile(["texto"], "falso.pdf", { type: "application/pdf" }) as File)).rejects.toThrow("PDF válido");
  });
});
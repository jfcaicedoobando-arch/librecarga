import { describe, it, expect } from "vitest";
import { faltantesTerrestre, paradasDeTexto, cpValido } from "../terrestrePricing";
import { camposFaltantesSolicitud } from "../camposObligatorios";
import { coincideTerrestre, criterioTerrestre } from "../tarifasTerrestresSugeridas";

describe("solicitud terrestre", () => {
  it("FTL exige tipo de unidad y LTL tarimas", () => {
    expect(faltantesTerrestre({ servicio: "Terrestre", submodalidad: "FTL" })).toEqual(["Tipo de unidad"]);
    expect(faltantesTerrestre({ servicio: "Terrestre", submodalidad: "LTL", tarimas: null })).toEqual(["Tarimas"]);
    expect(faltantesTerrestre({ servicio: "Terrestre", submodalidad: "Arrastre" })).toEqual([]);
    expect(faltantesTerrestre({ servicio: "Aéreo", submodalidad: "FTL" })).toEqual([]);
  });
  it("en terrestre la ruta se pide como ciudad", () => {
    const f = camposFaltantesSolicitud({ servicio: "Terrestre", submodalidad: "FTL" });
    expect(f).toContain("Ciudad de origen");
    expect(f).toContain("Tipo de unidad");
    expect(f).not.toContain("Puerto de origen");
  });
  it("paradas máximo 5 y CP de 5 dígitos", () => {
    expect(paradasDeTexto("a, b, c, d, e, f")).toHaveLength(5);
    expect(paradasDeTexto("  ")).toBeNull();
    expect(cpValido("6400")).toBeNull();
    expect(cpValido("64000")).toBe("64000");
  });
  it("coincide por CP o ciudad y unidad en FTL", () => {
    const c = criterioTerrestre({ submodalidad: "FTL", pol: "Monterrey", pod: "CDMX", origen_cp: null, destino_cp: "06600", tipo_unidad: "Thorton" })!;
    const base = { origen_cp: null, origen_ciudad: "monterrey", destino_cp: "06600", destino_ciudad: null, tipo_unidad: "Thorton" };
    expect(coincideTerrestre(base, c)).toBe(true);
    expect(coincideTerrestre({ ...base, tipo_unidad: "Rabón" }, c)).toBe(false);
    expect(coincideTerrestre({ ...base, destino_cp: "01000" }, c)).toBe(false);
  });
});

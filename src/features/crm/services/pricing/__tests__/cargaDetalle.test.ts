import { describe, expect, it } from "vitest";
import { normalizarNumeroUN, pesoMedidaWM } from "../modoPricing";
import { camposFaltantesSolicitud } from "../camposObligatorios";

describe("carga suelta y mercancía peligrosa", () => {
  it("LCL exige volumen CBM; FCL no", () => {
    expect(camposFaltantesSolicitud({ servicio: "Marítimo", submodalidad: "LCL" })).toContain("Volumen (CBM)");
    expect(camposFaltantesSolicitud({ servicio: "Marítimo", submodalidad: "FCL" })).not.toContain("Volumen (CBM)");
  });
  it("IMO sí exige clase y número UN", () => {
    const f = camposFaltantesSolicitud({ imo: true });
    expect(f).toEqual(expect.arrayContaining(["Clase IMO", "Número UN"]));
    expect(camposFaltantesSolicitud({ imo: false })).not.toContain("Clase IMO");
  });
  it("número UN acepta 4 dígitos", () => {
    expect(normalizarNumeroUN("UN 1203")).toBe("1203");
    expect(normalizarNumeroUN("120")).toBeNull();
  });
  it("W/M toma el mayor entre toneladas y CBM", () => {
    expect(pesoMedidaWM("2500", "kg", 1.8)).toBe(2.5);
    expect(pesoMedidaWM("500", "kg", 3)).toBe(3);
    expect(pesoMedidaWM("", "kg", 3)).toBeNull();
  });
});

describe("aviso de carga en pantalla", () => {
  it("LCL con IMO sin datos avisa los tres faltantes", async () => {
    const { faltantesCargaDetalle } = await import("../modoPricing");
    expect(faltantesCargaDetalle({ submodalidad: "LCL", imo: true })).toEqual(["Volumen (CBM)", "Clase IMO", "Número UN"]);
    expect(faltantesCargaDetalle({ submodalidad: "LCL", imo: true, volumen_cbm: 2, imo_clase: "3", imo_un: "1263" })).toEqual([]);
  });
});

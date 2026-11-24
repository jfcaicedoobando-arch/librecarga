import { describe, it, expect } from "vitest";
import { ambitoDeRecargo, monedaDeAmbito, etiquetaImpuesto } from "../ambitoRecargo";
import { llevaIva } from "@/features/cotizacion/domain/buildCostosDesdeTarifa";

describe("recargos locales e internacionales", () => {
  it("local se cobra en MXN e internacional en USD", () => {
    expect(monedaDeAmbito("local")).toBe("MXN");
    expect(monedaDeAmbito("internacional")).toBe("USD");
  });
  it("recargo sin tipo toma el de su moneda", () => {
    expect(ambitoDeRecargo({ moneda: "MXN" })).toBe("local");
    expect(ambitoDeRecargo({ moneda: "USD" })).toBe("internacional");
    expect(ambitoDeRecargo({}, "MXN")).toBe("local");
  });
  it("local usa IVA e internacional VAT", () => {
    expect(etiquetaImpuesto("local")).toBe("+ IVA");
    expect(etiquetaImpuesto("internacional")).toBe("+ VAT");
  });
  it("sólo el local marcado lleva IVA mexicano en la cotización", () => {
    expect(llevaIva({ ambito: "local", aplica_impuesto: true })).toBe(true);
    expect(llevaIva({ ambito: "internacional", aplica_impuesto: true })).toBe(false);
    expect(llevaIva({ ambito: "local", aplica_impuesto: false })).toBe(false);
  });
});

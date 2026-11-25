import { describe, expect, it } from "vitest";
import { notasTipoAvion, tipoAvionTarifa, tipoAvionCotizacion } from "../tipoAvionTarifa";

describe("tipo de avión de la tarifa", () => {
  it("la cotización usa la respuesta de Pricing antes que el dato histórico de la solicitud", () => {
    expect(tipoAvionCotizacion("Tipo de avión: CAO", "PAX")).toBe("CAO");
    expect(tipoAvionCotizacion(null, "PAX")).toBe("PAX");
  });
  it.each(["PAX", "CAO"] as const)("recupera %s guardado por Pricing", (tipo) => {
    expect(tipoAvionTarifa(notasTipoAvion(tipo))).toBe(tipo);
  });
  it("conserva como vacío las tarifas anteriores sin una selección explícita", () => {
    expect(tipoAvionTarifa("Servicio PAX sujeto a disponibilidad")).toBeNull();
    expect(tipoAvionTarifa(null)).toBeNull();
    expect(notasTipoAvion(null)).toBeNull();
  });
  it("lee la selección junto a otras notas sin inferirla de texto libre", () => {
    expect(tipoAvionTarifa("Conexión en LAX\nTipo de avión: CAO\nSujeto a espacio")).toBe("CAO");
  });
});
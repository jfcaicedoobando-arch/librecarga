import { describe, it, expect } from "vitest";
import { modoDesdeSolicitudPricing } from "../respuestaPricing";
const base = { incoterm: null, cantidad: null, tipo_carga: null };
describe("modoDesdeSolicitudPricing", () => {
  it("hereda Aéreo de la solicitud", () => expect(modoDesdeSolicitudPricing({ ...base, servicio: "Aéreo" })).toBe("Aéreo"));
  it("hereda Terrestre de la solicitud", () => expect(modoDesdeSolicitudPricing({ ...base, servicio: "Terrestre" })).toBe("Terrestre"));
  it("sin modo válido usa Marítimo", () => expect(modoDesdeSolicitudPricing({ ...base, servicio: "Otro" })).toBe("Marítimo"));
});

import { describe, expect, it } from "vitest";
import { puedeMarcarPerdida } from "../perdidaPricing";

describe("puedeMarcarPerdida", () => {
  it("permite a Pricing en respondida o cotizada sin motivo", () => {
    expect(puedeMarcarPerdida({ estado: "respondida", perdida_at: null }, true)).toBe(true);
    expect(puedeMarcarPerdida({ estado: "cotizada", perdida_at: null }, true)).toBe(true);
  });
  it("lo niega a quien no es Pricing", () => {
    expect(puedeMarcarPerdida({ estado: "respondida", perdida_at: null }, false)).toBe(false);
  });
  it("lo niega si ya tiene motivo o sigue en trabajo", () => {
    expect(puedeMarcarPerdida({ estado: "respondida", perdida_at: "2026-11-24T00:00:00Z" }, true)).toBe(false);
    expect(puedeMarcarPerdida({ estado: "en_proceso", perdida_at: null }, true)).toBe(false);
  });
});

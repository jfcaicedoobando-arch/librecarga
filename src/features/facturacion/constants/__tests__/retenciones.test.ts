import { describe, expect, it } from "vitest";
import { isrKeyFromTasa, ivaKeyFromTasa, RET_ISR_OPTIONS, RET_IVA_OPTIONS, tasaFromIsrKey, tasaFromIvaKey } from "../retenciones";

describe("catálogo de retenciones", () => {
  it.each(RET_ISR_OPTIONS)("conserva $key al convertir tasa → selección → tasa", ({ key, tasa }) => {
    expect(isrKeyFromTasa(tasa)).toBe(key);
    expect(tasaFromIsrKey(isrKeyFromTasa(tasa))).toBe(tasa);
  });
  it("expresa RESICO como tasa decimal, no como porcentaje entero", () => {
    expect(tasaFromIsrKey("isr_1_25")).toBe(0.0125);
    expect(RET_ISR_OPTIONS.find((option) => option.key === "isr_1_25")?.label).toBe("ISR 1.25% (RESICO)");
    expect(isrKeyFromTasa(0.0125 + Number.EPSILON)).toBe("isr_1_25");
  });
  it.each([null, undefined, 0, 0.0124, 0.0126, Number.NaN])("no inventa RESICO para %s", (tasa) => {
    expect(isrKeyFromTasa(tasa)).toBe("ninguna");
  });
  it("conserva la tolerancia previa del preset de 10%", () => {
    expect(isrKeyFromTasa(0.0999)).toBe("isr_10");
  });
  it.each(RET_IVA_OPTIONS)("conserva el preset IVA $key independiente del ISR", ({ key, tasa }) => {
    expect(ivaKeyFromTasa(tasa)).toBe(key);
    expect(tasaFromIvaKey(key)).toBe(tasa);
  });
});

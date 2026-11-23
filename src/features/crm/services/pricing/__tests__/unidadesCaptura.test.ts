import { describe, expect, it } from "vitest";
import { unidadesMedidaCaptura } from "../tiposPricing";

describe("unidadesMedidaCaptura", () => {
  it("la captura nueva no ofrece gramos", () => {
    expect(unidadesMedidaCaptura(null).map((u) => u.value)).toEqual(["kg", "lb", "t"]);
  });
  it("conserva gramos en una solicitud histórica que ya lo usa", () => {
    expect(unidadesMedidaCaptura("g").map((u) => u.value)).toContain("g");
  });
});

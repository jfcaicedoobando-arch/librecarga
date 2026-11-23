import { describe, expect, it } from "vitest";
import { incotermsDe, requiereSubmodalidad, submodalidadesDe } from "../modoPricing";
import { camposFaltantesSolicitud } from "../camposObligatorios";

describe("modo y submodalidad de Pricing", () => {
  it("Marítimo ofrece FCL/LCL y Terrestre FTL/LTL/Arrastre", () => {
    expect(submodalidadesDe("Marítimo")).toEqual(["FCL", "LCL"]);
    expect(submodalidadesDe("Terrestre")).toEqual(["FTL", "LTL", "Arrastre"]);
    expect(requiereSubmodalidad("Aéreo")).toBe(false);
  });
  it("CPT/CIP en todos los modos; FOB sólo marítimo", () => {
    expect(incotermsDe("Aéreo")).toEqual(expect.arrayContaining(["CPT", "CIP"]));
    expect(incotermsDe("Aéreo")).not.toContain("FOB");
    expect(incotermsDe("Marítimo")).toContain("FOB");
  });
  it("exige submodalidad y contenedor sólo en FCL", () => {
    expect(camposFaltantesSolicitud({ servicio: "Marítimo" })).toContain("Submodalidad");
    expect(camposFaltantesSolicitud({ servicio: "Marítimo", submodalidad: "LCL" })).not.toContain("Tipo de contenedor");
    expect(camposFaltantesSolicitud({ servicio: "Marítimo", submodalidad: "FCL" })).toContain("Tipo de contenedor");
  });
});

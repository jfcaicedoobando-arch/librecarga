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

import { horasPlazo } from "../modoPricing";
describe("plazos por modo (horas hábiles)", () => {
  it("Marítimo 36/48, Aéreo 12/24, Terrestre 24/48 y baja sin contador", () => {
    expect([horasPlazo("media", "Marítimo"), horasPlazo("alta", "Marítimo")]).toEqual([36, 48]);
    expect([horasPlazo("media", "Aéreo"), horasPlazo("alta", "Aéreo")]).toEqual([12, 24]);
    expect([horasPlazo("media", "Terrestre"), horasPlazo("alta", "Terrestre")]).toEqual([24, 48]);
    expect(horasPlazo("baja", "Aéreo")).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { buildCostosDesdeTarifa } from "../buildCostosDesdeTarifa";

const tarifa = { id: "t1", flete_base: 100, naviera_nombre: "Prov", tipo_contenedor_nombre: "40HC" };

describe("flete según modo", () => {
  it("Aéreo: Flete aéreo por kg", () => {
    const [f] = buildCostosDesdeTarifa({ tarifa, recargos: [], markup: 0, modo: "Aéreo" });
    expect(f.concepto).toBe("Flete aéreo");
    expect(f.unidad_medida).toBe("kg");
  });
  it("Terrestre: Flete terrestre por viaje", () => {
    const [f] = buildCostosDesdeTarifa({ tarifa, recargos: [], markup: 0, modo: "Terrestre" });
    expect(f.concepto).toBe("Flete terrestre");
    expect(f.unidad_medida).toBe("viaje");
  });
  it("Marítimo FCL conserva contenedor", () => {
    const [f] = buildCostosDesdeTarifa({ tarifa, recargos: [], markup: 0, tipoEmbarque: "FCL" });
    expect(f.concepto).toBe("Flete marítimo (40HC)");
    expect(f.unidad_medida).toBe("contenedor");
  });
});

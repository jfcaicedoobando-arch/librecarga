import { describe, it, expect } from "vitest";
import { faltantesTarifaMultimodo, payloadTarifaMultimodo, usaTramos, type TarifaMultimodoForm } from "../tarifaMultimodo";

const aereo: TarifaMultimodoForm = {
  modo: "Aéreo", agente_id: "a", moneda: "USD", origen: "PVG", destino: "MEX", aerolinea: "",
  submodalidad: "", tipo_unidad: "", flete_base: 4, minimo: 100,
  vigente_desde: "2026-12-01", vigente_hasta: "2026-12-31", transit_time_dias: null,
  tramos: [{ desde_kg: 45, precio: 3 }],
};

describe("tarifa aérea/terrestre", () => {
  it("aéreo exige aeropuertos IATA distintos", () => {
    expect(faltantesTarifaMultimodo(aereo)).toEqual([]);
    expect(faltantesTarifaMultimodo({ ...aereo, destino: "PVG" })).toContain("Origen y destino distintos");
  });
  it("terrestre exige submodalidad y separa CP de ciudad", () => {
    const t = { ...aereo, modo: "Terrestre" as const, origen: "64000", destino: "Laredo", submodalidad: "FTL" };
    expect(faltantesTarifaMultimodo({ ...t, submodalidad: "" })).toContain("Submodalidad");
    const p = payloadTarifaMultimodo(t);
    expect(p).toMatchObject({ origen_cp: "64000", destino_ciudad: "Laredo", unidad_flete: "viaje", tramos: [] });
  });
  it("sólo aéreo y LTL usan rangos de peso", () => {
    expect(usaTramos({ modo: "Terrestre", submodalidad: "LTL" })).toBe(true);
    expect(usaTramos({ modo: "Terrestre", submodalidad: "FTL" })).toBe(false);
  });
});

describe("moneda de tarifa aérea/terrestre", () => {
  it("envía la moneda elegida (MXN) al servidor", async () => {
    const { payloadTarifaMultimodo: p } = await import("../tarifaMultimodo");
    const out = p({ modo: "Aéreo", agente_id: "a", moneda: "MXN", origen: "PVG", destino: "MEX", aerolinea: "",
      submodalidad: "", tipo_unidad: "", flete_base: 100, minimo: null, vigente_desde: "2026-11-01",
      vigente_hasta: "2026-12-01", transit_time_dias: null, tramos: [] });
    expect(out.moneda).toBe("MXN");
  });
});

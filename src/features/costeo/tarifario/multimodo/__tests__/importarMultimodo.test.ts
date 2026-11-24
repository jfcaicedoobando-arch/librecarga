import { describe, expect, it } from "vitest";
import { prepararMultimodo, rangosPeso, MAX_FILAS_MULTIMODO } from "../importarMultimodo";

const agentes = [{ id: "a1", nombre: "Agente Asia" }];
const aereo = {
  Modo: "Aéreo", Agente: "agente asia", Moneda: "USD", Origen: "pvg", Destino: "MEX", Escalas: "LAX",
  "Precio base": "4.80", "Mínimo": 150, "Inicio vigencia": "01/12/2026", "Término vigencia": "31/12/2026",
  "Rangos de peso": "100:4.2; 45:4.5",
};

describe("prepararMultimodo", () => {
  it("convierte una tarifa aérea con IATA en mayúsculas, fechas y rangos ordenados", () => {
    const r = prepararMultimodo([aereo], agentes);
    expect(r.errores).toEqual([]);
    const f = r.tarifas[0].form;
    expect(f).toMatchObject({ modo: "Aéreo", agente_id: "a1", origen: "PVG", flete_base: 4.8, minimo: 150,
      vigente_desde: "2026-12-01", vigente_hasta: "2026-12-31" });
    expect(f.tramos).toEqual([{ desde_kg: 45, precio: 4.5 }, { desde_kg: 100, precio: 4.2 }]);
  });
  it("terrestre FTL no guarda rangos de peso y exige submodalidad válida", () => {
    const base = { Modo: "Terrestre", Agente: "Agente Asia", Moneda: "MXN", Origen: "Monterrey", Destino: "06600",
      "Precio base": 18000, "Inicio vigencia": "2026-12-01", "Término vigencia": "2026-12-31", "Rangos de peso": "45:1" };
    const ok = prepararMultimodo([{ ...base, Submodalidad: "FTL" }], agentes);
    expect(ok.tarifas[0].form.tramos).toEqual([]);
    const mal = prepararMultimodo([{ ...base, Submodalidad: "Tren" }], agentes);
    expect(mal.errores[0]).toContain("Fila 2");
  });
  it("rechaza agente desconocido, moneda EUR y vigencia invertida", () => {
    const r = prepararMultimodo([
      { ...aereo, Agente: "Otro" }, { ...aereo, Moneda: "EUR" },
      { ...aereo, "Inicio vigencia": "31/12/2026", "Término vigencia": "01/12/2026" },
    ], agentes);
    expect(r.tarifas).toHaveLength(0);
    expect(r.errores).toHaveLength(3);
  });
  it("omite renglones vacíos y rechaza archivos de más de 500 renglones", () => {
    expect(prepararMultimodo([{ Modo: "", Agente: "" }], agentes)).toEqual({ tarifas: [], errores: [] });
    const r = prepararMultimodo(Array(MAX_FILAS_MULTIMODO + 1).fill(aereo), agentes);
    expect(r.tarifas).toHaveLength(0);
    expect(r.errores[0]).toContain("máximo es 500");
  });
  it("rangosPeso rechaza texto mal formado", () => {
    expect(rangosPeso("45-4.5")).toBeNull();
  });
});

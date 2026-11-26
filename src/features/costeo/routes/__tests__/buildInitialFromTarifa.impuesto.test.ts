import { describe, it, expect } from "vitest";
import { buildInitialFromTarifa } from "../CosteoTarifas.helpers";

describe("buildInitialFromTarifa conserva ámbito e impuesto", () => {
  it("copia ambito y aplica_impuesto de cada recargo", () => {
    const r = buildInitialFromTarifa({
      agente_id: "a", naviera_id: "n", ruta_id: "r", tipo_contenedor_id: "c",
      flete_base: 100, dias_libres_demoras: 0, vigente_desde: "2026-01-01",
      vigente_hasta: "2026-12-31", transit_time_dias: 10, notas: null,
      recargos: [
        { concepto: "X", lado: "origen", monto: 5, moneda: "MXN", incluido_en_total: true, ambito: "local", aplica_impuesto: true },
        { concepto: "Y", lado: "destino", monto: 5, moneda: "USD", incluido_en_total: true, ambito: "internacional", aplica_impuesto: false },
      ],
    } as never);
    expect(r.recargos?.[0]).toMatchObject({ ambito: "local", aplica_impuesto: true });
    expect(r.recargos?.[1]).toMatchObject({ ambito: "internacional", aplica_impuesto: false });
  });
});

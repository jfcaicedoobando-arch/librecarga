import { describe, it, expect } from "vitest";
import { resumirCostoReal, compararMoneda, agruparPorSolicitud, type FilaCostoReal } from "../costoVsRealPricing";
import { puedeRecotizar, resumenTarifa } from "../versionesPricing";

const fila = (p: Partial<FilaCostoReal>): FilaCostoReal => ({
  solicitud_id: "s1", cotizacion_id: "c1", cotizacion_folio: "COT-1", embarque_id: "e1", expediente: "EXP-1",
  moneda: "USD", costo_cotizado: 1000, costo_real: 0, facturas: 0, ...p,
});

describe("costo cotizado vs real", () => {
  it("diferencia = real − cotizado y % sobre lo cotizado", () => {
    expect(compararMoneda("USD", 1000, 1150)).toEqual({ moneda: "USD", cotizado: 1000, real: 1150, diferencia: 150, pct: 15 });
  });
  it("sin costo cotizado no inventa porcentaje", () => expect(compararMoneda("MXN", 0, 500).pct).toBeNull());
  it("compara cada moneda por separado, nunca las suma", () => {
    const r = resumirCostoReal([fila({ moneda: "USD", costo_real: 900, facturas: 1 }), fila({ moneda: "MXN", costo_cotizado: 2000, costo_real: 2500, facturas: 1 })]);
    expect(r.estado).toBe("con_resultado");
    expect(r.monedas.map((m) => [m.moneda, m.diferencia])).toEqual([["USD", -100], ["MXN", 500]]);
  });
  it("con embarque pero sin facturas queda «Esperando facturas»", () => {
    expect(resumirCostoReal([fila({})]).estado).toBe("esperando_facturas");
  });
  it("cotización sin embarque queda «Sin embarque»", () => {
    expect(resumirCostoReal([fila({ embarque_id: null, moneda: null })]).estado).toBe("sin_embarque");
  });
  it("agrupa por solicitud", () => {
    const m = agruparPorSolicitud([fila({}), fila({ solicitud_id: "s2", embarque_id: null })]);
    expect(m.get("s1")?.estado).toBe("esperando_facturas");
    expect(m.get("s2")?.estado).toBe("sin_embarque");
  });
});

describe("recotizar", () => {
  it("sólo Pricing y sólo respondida/cotizada", () => {
    expect(puedeRecotizar({ estado: "respondida" }, true)).toBe(true);
    expect(puedeRecotizar({ estado: "cotizada" }, true)).toBe(true);
    expect(puedeRecotizar({ estado: "en_proceso" }, true)).toBe(false);
    expect(puedeRecotizar({ estado: "respondida" }, false)).toBe(false);
  });
  it("describe la tarifa guardada en la versión", () => {
    expect(resumenTarifa({ modo: "Aéreo", moneda: "USD", vigente_desde: "2026-11-01", vigente_hasta: "2026-11-30" }))
      .toBe("Aéreo · USD · vigencia 2026-11-01 a 2026-11-30");
  });
});

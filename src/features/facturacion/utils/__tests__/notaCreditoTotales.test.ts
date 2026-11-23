/**
 * P1-IVA — Totales de la NC con tratamientos mixtos y retenciones.
 */
import { describe, it, expect } from "vitest";
import { calcularTotalesNC } from "../notaCreditoTotales";
import type { ConceptoNotaCredito } from "@/features/facturacion/services/notasCredito";

const c = (extra: Partial<ConceptoNotaCredito>): ConceptoNotaCredito => ({
  descripcion: "Servicio",
  cantidad: 1,
  precio_unitario: 1000,
  ...extra,
});

describe("calcularTotalesNC", () => {
  it("agrupa dos renglones aprobados y conserva el total de la factura RESICO", () => {
    const linea = c({ precio_unitario: 100.4, tipo_iva: "gravado_16", tasa_iva: .16,
      tasa_ret_isr: .0125, tasa_ret_iva: .04 });
    expect(calcularTotalesNC([linea, linea], true)).toEqual({
      subtotal: 200.8, iva: 32.13, retIsr: 2.51, retIva: 8.03, total: 222.39,
    });
    expect(calcularTotalesNC([linea, linea]).total).toBe(222.36);
  });

  it("factura mixta: cada renglón aporta su propio IVA", () => {
    const t = calcularTotalesNC([
      c({ tipo_iva: "gravado_16", tasa_iva: 0.16 }),
      c({ tipo_iva: "gravado_8", tasa_iva: 0.08 }),
      c({ tipo_iva: "tasa_0", tasa_iva: 0 }),
      c({ tipo_iva: "exento", tasa_iva: 0.16 }),
      c({ tipo_iva: "no_objeto", tasa_iva: null }),
    ]);
    expect(t.subtotal).toBe(5000);
    expect(t.iva).toBe(240);
    expect(t.total).toBe(5240);
  });

  it("descuenta las retenciones ISR e IVA", () => {
    const t = calcularTotalesNC([
      c({ tipo_iva: "gravado_16", tasa_iva: 0.16, tasa_ret_isr: 0.1, tasa_ret_iva: 0.04 }),
    ]);
    expect(t.retIsr).toBe(100);
    expect(t.retIva).toBe(40);
    expect(t.total).toBe(1020);
  });

  it("un renglón exento ya no suma IVA al 16% global", () => {
    const t = calcularTotalesNC([c({ tipo_iva: "exento", tasa_iva: 0.16 })]);
    expect(t.iva).toBe(0);
    expect(t.total).toBe(1000);
  });
});

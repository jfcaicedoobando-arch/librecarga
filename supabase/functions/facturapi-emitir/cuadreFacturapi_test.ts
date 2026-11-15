import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { diferenciasCuadreFiscal, type ConceptoCuadre } from "./cuadreFiscal.ts";
import { diferenciasCuadreFacturapi, recalcularTotalesFacturapi, usaCuadreFacturapi } from "./cuadreFacturapi.ts";
import { validarCuadreFiscal, validarCuadreSubtotal } from "./contextoCuadre.ts";
import type { FacturaRow } from "./types.ts";

const linea = (precio: number | string, extra: Partial<ConceptoCuadre> = {}): ConceptoCuadre => ({
  descripcion: "Servicio", cantidad: 1, precio_unitario: precio,
  tipo_iva: "gravado_16", tasa_iva: 0.16, tasa_ret_isr: 0.0125, ...extra,
});

Deno.test("grouped arithmetic matches five observed sandbox preview totals without editing unit price", () => {
  const casos: Array<[ConceptoCuadre[], number]> = [
    [[linea(10000)], 11475], [[linea("100.3996")], 115.21], [[linea("100.40")], 115.20],
    [[linea("40.15984", { cantidad: "2.5" })], 115.21], [[linea("100.40"), linea("100.40")], 230.42],
  ];
  for (const [filas, total] of casos) {
    const before = JSON.stringify(filas);
    assertEquals(recalcularTotalesFacturapi(filas).total, total);
    assertEquals(JSON.stringify(filas), before);
  }
});

Deno.test("exact decimal bases are accumulated before rounding and binary half-cent does not disappear", () => {
  assertEquals(recalcularTotalesFacturapi([linea("1.005")]).subtotal, 1.01);
  assertEquals(recalcularTotalesFacturapi([linea("1.004"), linea("1.004")]).subtotal, 2.01);
  const observado = recalcularTotalesFacturapi([linea("100.0049", { tipo_iva: "tasa_0", tasa_iva: 0 }), linea("100.0049", { tipo_iva: "tasa_0", tasa_iva: 0 })]);
  assertEquals(observado.subtotal, 200.01);
  assertEquals(observado.total, 197.51);
});

Deno.test("transfer and withholding groups retain their own rates", () => {
  const result = recalcularTotalesFacturapi([
    linea("0.04", { tasa_ret_iva: 0.04 }),
    linea("0.04", { tipo_iva: "gravado_8", tasa_iva: 0.08, tasa_ret_isr: 0.1, tasa_ret_iva: 0.106667 }),
  ]);
  assertEquals(result, { subtotal: 0.08, iva_trasladado: 0.01, ret_iva: 0, ret_isr: 0, total: 0.09 });
});

Deno.test("mixed transfer and withholding rates match observed sandbox PDF totals", () => {
  const ivaMixto = [linea(50.04), linea(100.08, { tipo_iva: "gravado_8", tasa_iva: 0.08 })];
  assertEquals(recalcularTotalesFacturapi(ivaMixto).total, 164.26);
  const isrMixto = [linea(100.4, { tipo_iva: "tasa_0", tasa_iva: 0 }), linea(12.55, { tipo_iva: "tasa_0", tasa_iva: 0, tasa_ret_isr: 0.1 })];
  assertEquals(recalcularTotalesFacturapi(isrMixto).ret_isr, 2.52);
  assertEquals(recalcularTotalesFacturapi(isrMixto).total, 110.43);
  assertEquals(recalcularTotalesFacturapi([linea(100.375, { tasa_ret_iva: 0.04 }), linea(100.375, { tasa_ret_iva: 0.04 })]).total, 222.33);
});

Deno.test("ISR mode rejects two cents even with many lines and rejects missing header totals", () => {
  const filas = Array.from({ length: 10 }, () => linea(100));
  const t = recalcularTotalesFacturapi(filas);
  assertEquals(diferenciasCuadreFacturapi(filas, { subtotal: t.subtotal, iva: t.iva_trasladado, total: t.total + 0.02, ret_isr: t.ret_isr, ret_iva: t.ret_iva }).length, 1);
  assertEquals(diferenciasCuadreFacturapi(filas, { subtotal: null, iva: null, total: null }).length, 5);
});

Deno.test("other rates retain legacy behavior and unknown tax values cannot enter exact arithmetic", () => {
  assertEquals(usaCuadreFacturapi([{ tasa_ret_isr: "0.012500" }]), true);
  assertEquals(usaCuadreFacturapi([{ tasa_ret_isr: 0.012499 }]), false);
  const filas = [linea(100, { tasa_ret_isr: 0.1 }), linea(50, { tasa_ret_isr: 0.1 })];
  assertEquals(diferenciasCuadreFiscal(filas, { subtotal: 150.02, iva: 24, total: 159.02 }), []);
  assertThrows(() => recalcularTotalesFacturapi([linea(Infinity)]));
});

Deno.test("full context guard still rejects mismatch during PENDING claim after subtotal deferral", () => {
  const factura: FacturaRow = { id: "factura", estado: "Borrador", cliente_id: "cliente", organization_id: "org", facturapi_id: "PENDING:claim", subtotal: 200.8, iva: 32.13, total: 230.40, ret_isr: 2.51, ret_iva: 0 };
  const filas = [100.4, 100.4].map((precio) => ({ descripcion: "Servicio", cantidad: 1, precio_unitario: precio, tasa_ret_isr: 0.0125, tipo_iva: "gravado_16" as const, tasa_iva: 0.16 }));
  assertEquals(validarCuadreSubtotal(filas, factura), null);
  assertEquals(validarCuadreFiscal(filas, factura)?.status, 422);
  assertEquals(validarCuadreFiscal(filas, { ...factura, total: 230.42 }), null);
  assertEquals(validarCuadreFiscal(filas, { ...factura, estado: "Por timbrar" })?.status, 422);
  for (const historica of [{ snapshot_emision: {} }, { uuid_fiscal: "uuid" }, { estado: "Emitida" }]) {
    assertEquals(validarCuadreFiscal(filas, { ...factura, ...historica, iva: 32.12 }), null);
  }
});

Deno.test("grouped guard rejects swapped withholding headers even when total remains correct", () => {
  const filas = [linea(10000, { tasa_ret_iva: 0.04 })];
  const detalles = diferenciasCuadreFacturapi(filas, { subtotal: 10000, iva: 1600, ret_isr: 400, ret_iva: 125, total: 11075 });
  assertEquals(detalles.length, 2);
  assertEquals(detalles.every((d) => d.startsWith("Retención")), true);
});

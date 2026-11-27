import { describe, expect, it } from "vitest";
import { clasificarRevisionImportacion, firmaRevisionImportacion, moverDiaImportacion, type EspejoImportacion } from "../revisionImportacion";
import type { MovimientoParseado } from "../bbva";
const fila = (hash = "banco"): MovimientoParseado => ({ fecha: "2026-10-03", concepto: "Depósito", referencia: "R", cargo: 0, abono: 25, saldo: 100, hash_dedupe: hash });
const espejo = (overrides: Partial<EspejoImportacion> = {}): EspejoImportacion => ({
  id: "e1", cuenta_bancaria_id: "cuenta", fecha: "2026-10-02", cargo: 0, abono: 25,
  hash_dedupe: "cobro-p1", pago_factura_id: "p1", pago_proveedor_id: null, estado_conciliacion: "Conciliado",
  referencia: null, ...overrides,
});
const egreso = { ...fila(), cargo: 20, abono: 0 };
const pago = espejo({ fecha: egreso.fecha, cargo: 20, abono: 0, hash_dedupe: "pago-cxp", pago_factura_id: null,
  pago_proveedor_id: "cxp", referencia: egreso.referencia });
describe("Revisión sin mutaciones del estado de cuenta", () => {
  it("distingue nueva, duplicada y vinculable sin duplicar importes", () => {
    const r = clasificarRevisionImportacion([fila("duplicada"), fila("vinculable"), { ...fila("nueva"), abono: 10 }], new Set(["duplicada"]), [espejo()]);
    expect(r.filas.map((f) => f.estado)).toEqual(["Duplicada", "Vinculable", "Nueva"]);
    expect([r.duplicadas, r.vinculables, r.nuevas, r.abonos]).toEqual([1, 1, 1, 60]);
  });
  it("una coincidencia ambigua nunca se propone como vínculo automático", () => {
    const r = clasificarRevisionImportacion([fila()], new Set(), [espejo(), espejo({ id: "e2" })]);
    expect(r.filas[0]).toMatchObject({ estado: "Ambigua", espejo: null, coincidencias: 2 });
  });
  it("omite el egreso conciliado con referencia exacta y conserva las otras líneas del archivo", () => {
    const otraFila = { ...egreso, referencia: "Otra transferencia", hash_dedupe: "otra" };
    const r = clasificarRevisionImportacion([egreso, otraFila], new Set(), [pago]);
    expect(r.filas.map((f) => f.estado)).toEqual(["Duplicada", "Nueva"]);
    expect(r.filas[0].espejo).toBe(pago);
    expect(r).toMatchObject({ duplicadas: 1, nuevas: 1, vinculables: 0 });
  });
  it.each([{ fecha: "2026-10-02" }, { estado_conciliacion: "Pendiente" }, { cargo: 20.01 },
    { referencia: null }, { pago_proveedor_id: null }])("no omite egresos con diferencias (%j)", (overrides) => {
    expect(clasificarRevisionImportacion([egreso], new Set(), [{ ...pago, ...overrides }]).nuevas).toBe(1);
  });
  it("no adivina cuando dos egresos conciliados coinciden o falta la referencia", () => {
    expect(clasificarRevisionImportacion([egreso], new Set(), [pago, { ...pago, id: "e2" }]).ambiguas).toBe(1);
    expect(clasificarRevisionImportacion([{ ...egreso, referencia: "" }], new Set(), [{ ...pago, referencia: "" }]).nuevas).toBe(1);
  });
  it("dos filas del archivo consumen un espejo como máximo una vez", () => {
    const r = clasificarRevisionImportacion([fila("uno"), fila("dos")], new Set(), [espejo()]);
    expect(r.filas.map((f) => f.estado)).toEqual(["Vinculable", "Nueva"]);
  });
  it("un hash repetido de un caller directo no consume un segundo espejo", () => {
    const r = clasificarRevisionImportacion([fila(), fila()], new Set(), [espejo()]);
    expect(r.filas.map((f) => f.estado)).toEqual(["Vinculable", "Duplicada"]);
  });
  it.each([{ fecha: "2026-09-29" }, { abono: 25.01 }, { hash_dedupe: "anticipo-a" }, { pago_factura_id: null }])("excluye candidatos fuera del contrato (%j)", (overrides) => {
    expect(clasificarRevisionImportacion([fila()], new Set(), [espejo(overrides)]).vinculables).toBe(0);
  });
  it("fecha civil y límites de mes mantienen la ventana de tres días", () => {
    expect(moverDiaImportacion("2026-10-01", -3)).toBe("2026-09-28");
    expect(clasificarRevisionImportacion([fila()], new Set(), [espejo({ fecha: "2026-09-30" })]).vinculables).toBe(1);
  });
  it.each([
    ["2026-03-10", "2026-03-07", "2026-03-06"],
    ["2026-11-03", "2026-10-31", "2026-10-30"],
    ["2028-03-02", "2028-02-28", "2028-02-27"],
    ["2027-01-02", "2026-12-30", "2026-12-29"],
  ])("la ventana civil incluye tres días y excluye cuatro alrededor de %s", (fecha, limite, fuera) => {
    const movimiento = { ...fila(), fecha };
    expect(clasificarRevisionImportacion([movimiento], new Set(), [espejo({ fecha: limite })]).vinculables).toBe(1);
    expect(clasificarRevisionImportacion([movimiento], new Set(), [espejo({ fecha: fuera })]).vinculables).toBe(0);
    expect(moverDiaImportacion(fecha, -3)).toBe(limite);
    expect(moverDiaImportacion(limite, 3)).toBe(fecha);
  });
  it("una fecha ausente bloquea la preparación del rango en lugar de producir un día inválido", () => {
    expect(() => moverDiaImportacion("", -3)).toThrow("fecha del movimiento");
  });
  it("la huella de revisión cambia si el mismo candidato cambia de pago o fecha", () => {
    const firma = firmaRevisionImportacion(clasificarRevisionImportacion([fila()], new Set(), [espejo()]));
    expect(firmaRevisionImportacion(clasificarRevisionImportacion([fila()], new Set(), [espejo({ pago_factura_id: "p2" })]))).not.toBe(firma);
    expect(firmaRevisionImportacion(clasificarRevisionImportacion([fila()], new Set(), [espejo({ fecha: "2026-10-03" })]))).not.toBe(firma);
  });
});

import { describe, expect, it } from "vitest";
import { mapConceptoVentaDbAFila } from "../../hidratarConceptoVenta";
import { buildConceptosVentaPayload } from "../embarqueToDbConceptos";

const row = { id: "venta-1", descripcion: "Flete", cantidad: 2, precio_unitario: 100.40,
  moneda: "MXN", contenedor_id: "contenedor-1", tipo_iva: "gravado_16", tasa_iva_aplicada: 0.16 };

describe("edición fiscal del embarque", () => {
  it("preserva evaluación y origen al reabrir sin convertir el ISR en descuento de venta", () => {
    const evaluacion = { ambiente: "sandbox", estado: "aplica", regla_version: "resico_113j_v1", tasa_ret_isr: 0.0125 };
    const fila = mapConceptoVentaDbAFila({ ...row, evaluacion_fiscal: evaluacion,
      tasa_ret_isr: "0.0125", monto_ret_isr: "2.51", origen: "cotizacion", cotizacion_concepto_origen_id: "cot-line-1" }, 0);
    expect(fila).toMatchObject({ dbId: row.id, evaluacionFiscal: evaluacion, tasaRetIsr: 0.0125, montoRetIsr: 2.51, origen: "cotizacion" });
    const [payload] = buildConceptosVentaPayload([fila]);
    expect(payload).toMatchObject({ id: row.id, evaluacion_fiscal: evaluacion, origen: "cotizacion", cotizacion_concepto_origen_id: "cot-line-1", total: 200.80, contenedor_id: row.contenedor_id });
    expect(payload).not.toHaveProperty("monto_ret_isr");
    expect(payload).not.toHaveProperty("tasa_ret_isr");
  });

  it("no activa ni exenta históricos sin evaluación", () => {
    const [payload] = buildConceptosVentaPayload([mapConceptoVentaDbAFila(row, 0)]);
    expect(payload).not.toHaveProperty("evaluacion_fiscal");
    expect(payload).not.toHaveProperty("tasa_ret_isr");
  });

  it("rechaza retención IVA comercial no soportada en vez de descartarla", () => {
    const fila = mapConceptoVentaDbAFila({ ...row, tasa_ret_iva: 0.04 }, 0);
    expect(() => buildConceptosVentaPayload([fila])).toThrow(/retención de IVA comercial/);
  });

  it("edita la base y conserva la evaluación para que el servidor vuelva a calcular", () => {
    const fila = mapConceptoVentaDbAFila({ ...row, evaluacion_fiscal: { ambiente: "sandbox", estado: "pendiente" }, origen: "demoras_auto" }, 0);
    const [payload] = buildConceptosVentaPayload([{ ...fila, precioUnitario: 125 }]);
    expect(payload).toMatchObject({ total: 250, evaluacion_fiscal: { ambiente: "sandbox", estado: "pendiente" }, origen: "demoras_auto" });
  });
});

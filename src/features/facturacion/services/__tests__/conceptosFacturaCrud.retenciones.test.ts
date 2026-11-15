import { beforeEach, describe, expect, it, vi } from "vitest";
import { isrKeyFromTasa, tasaFromIsrKey } from "../../constants/retenciones";
import { agregarConceptoFactura, actualizarConceptoFactura, fetchConceptosFactura } from "../conceptosFacturaCrud";

const mock = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("@/services/__tests__/_supabaseChainMock");
  return createSupabaseMock();
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: mock.supabase }));
vi.mock("@/services/bitacora/registrar", () => ({ registrarActividad: vi.fn() }));

describe("contrato de retención al guardar, leer y editar conceptos", () => {
  beforeEach(() => {
    mock.resetResults(); mock.tableCalls.length = 0; mock.rpcCalls.length = 0;
    mock.setTableResult("facturas", { data: { subtotal: 10000, iva: 1600, ret_isr: 125, ret_iva: 400, total: 11075 }, error: null });
  });
  it.each([0, 0.0125, 0.1])("conserva tasa ISR %s y retención IVA independiente", async (tasa) => {
    await agregarConceptoFactura({ facturaId: "factura", organizationId: "org", moneda: "MXN",
      input: { descripcion: "Servicio", cantidad: 1, precio_unitario: 10000, clave_sat: "78101800",
        tipo_iva: "gravado_16", tasa_ret_isr: tasa, tasa_ret_iva: 0.04 } });
    const insert = mock.tableCalls.find((call) => call.table === "conceptos_factura" && call.ops.includes("insert"))!;
    const payload = insert.opArgs[insert.ops.indexOf("insert")][0];
    expect(payload).toMatchObject({ tasa_ret_isr: tasa, tasa_ret_iva: 0.04, total: 10000 });
    // Simula el contrato de lectura del servidor; el cálculo fiscal queda en SQL.
    mock.setTableResult("conceptos_factura", { data: [{ ...(payload as object), id: "concepto" }], error: null });
    const [row] = await fetchConceptosFactura("factura");
    expect(row.tasa_ret_isr).toBe(tasa);
    await actualizarConceptoFactura({ conceptoId: row.id, facturaId: row.factura_id,
      input: { descripcion: "Descripción actualizada", cantidad: row.cantidad, precio_unitario: row.precio_unitario,
        clave_sat: row.clave_sat, tipo_iva: "gravado_16",
        tasa_ret_isr: tasaFromIsrKey(isrKeyFromTasa(row.tasa_ret_isr)), tasa_ret_iva: row.tasa_ret_iva } });
    const update = mock.tableCalls.find((call) => call.table === "conceptos_factura" && call.ops.includes("update"))!;
    expect(update.opArgs[update.ops.indexOf("update")][0]).toMatchObject({
      descripcion: "Descripción actualizada", tasa_ret_isr: tasa, tasa_ret_iva: 0.04, total: 10000,
    });
    expect(mock.rpcCalls.filter((call) => call.fn === "recalc_factura_totales")).toHaveLength(2);
  });
});

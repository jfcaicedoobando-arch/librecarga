import { describe, it, expect, vi, beforeEach } from "vitest";
const mock = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("@/services/__tests__/_supabaseChainMock");
  return createSupabaseMock();
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: mock.supabase }));
import { fetchFacturasPagina, fetchClientesFacturas, fetchFacturasParaExportar } from "../facturasPagina";
import { facturas } from "../../queryKeys";
const ROW = {
  id: "f-101", numero: "F-101", cliente_nombre: "ACME", expediente: "E-1",
  total: 116, moneda: "MXN", fecha_emision: "2026-01-01", fecha_vencimiento: "2026-01-31",
  estado: "Emitida", proforma_id: null, factura_pdf_url: null, factura_xml_url: null,
  ambiente: "sandbox", acuse_cancelacion_status: null, cancellation_status: null,
  enviada_cliente_at: null, proformas: null,
};
beforeEach(() => { mock.rpcCalls.length = 0; mock.supabase.rpc.mockClear(); mock.resetResults(); });
describe("Emitidas: filtros antes de paginar", () => {
  it("mantiene cliente exacto independiente de búsqueda, estado y rango inclusivo", async () => {
    mock.setRpcResult("facturas_listado_pagina", { data: { rows: [ROW], count: 201 }, error: null });
    const result = await fetchFacturasPagina({ organizationId: "org", clienteNombre: "ACME", search: "F-", estado: "Emitida", fechaDesde: "2026-01-01", fechaHasta: "2026-01-31", page: 1, pageSize: 100 });
    expect(mock.rpcCalls[0]).toEqual({ fn: "facturas_listado_pagina", args: { p_organization_id: "org", p_cliente_nombre: "ACME", p_search: "F-", p_estado: "Emitida", p_fecha_desde: "2026-01-01", p_fecha_hasta: "2026-01-31", p_offset: 100, p_limit: 100 } });
    expect(result).toEqual({ data: [ROW], count: 201 });
  });
  it("conserva count con página fuera de rango y omite filtros vacíos", async () => {
    mock.setRpcResult("facturas_listado_pagina", { data: { rows: [], count: 3 }, error: null });
    const result = await fetchFacturasPagina({ organizationId: null, estado: "todos", clienteNombre: "", fechaDesde: "", page: 9 });
    expect(result.count).toBe(3);
    expect(mock.rpcCalls[0].args).toMatchObject({ p_organization_id: undefined, p_estado: undefined, p_cliente_nombre: undefined, p_fecha_desde: undefined, p_offset: 450 });
  });
  it("catálogo global independiente de filtros y página; error no se convierte en vacío", async () => {
    mock.setRpcResult("facturas_clientes_listado", { data: ["ACME", "Histórico"], error: null });
    expect(await fetchClientesFacturas("org")).toEqual(["ACME", "Histórico"]);
    expect(mock.rpcCalls[0]).toEqual({ fn: "facturas_clientes_listado", args: { p_organization_id: "org" } });
    mock.setRpcResult("facturas_clientes_listado", { data: null, error: new Error("offline") });
    await expect(fetchClientesFacturas("org")).rejects.toThrow("offline");
  });
  it.each(["clienteNombre", "fechaDesde", "fechaHasta"] as const)("separa cache por %s", (field) => {
    expect(facturas.listado({ [field]: "A" })).not.toEqual(facturas.listado({ [field]: "B" }));
  });
  it.each([null, "116", Number.NaN])("rechaza total inválido %s antes de mostrar importes", async (total) => {
    mock.setRpcResult("facturas_listado_pagina", { data: { rows: [{ ...ROW, total }], count: 1 }, error: null });
    await expect(fetchFacturasPagina({ organizationId: "org" })).rejects.toThrow();
  });
  it("rechaza un conteo o catálogo malformado en lugar de aparentar resultados vacíos", async () => {
    mock.setRpcResult("facturas_listado_pagina", { data: { rows: [], count: -1 }, error: null });
    await expect(fetchFacturasPagina({ organizationId: "org" })).rejects.toThrow();
    mock.setRpcResult("facturas_clientes_listado", { data: [null], error: null });
    await expect(fetchClientesFacturas("org")).rejects.toThrow();
  });
});

describe("Exportación de todos los resultados filtrados", () => {
  const scope = { organizationId: "org", assertCurrent: vi.fn(), isCurrent: () => true };
  const primeraPagina = Array.from({ length: 500 }, (_, index) => ({ ...ROW, id: `factura-${index}` }));

  it("recorre las páginas con los mismos filtros y conserva el orden de servidor", async () => {
    mock.supabase.rpc
      .mockResolvedValueOnce({ data: { rows: primeraPagina, count: 501 }, error: null })
      .mockResolvedValueOnce({ data: { rows: [ROW], count: 501 }, error: null });
    const filtros = { search: "F-", estado: "Emitida", clienteNombre: "ACME", fechaDesde: "2026-01-01", fechaHasta: "2026-01-31" };
    const result = await fetchFacturasParaExportar(filtros, scope);
    expect(result.map(({ id }) => id)).toEqual([...primeraPagina.map(({ id }) => id), ROW.id]);
    const args = { p_organization_id: "org", p_search: "F-", p_estado: "Emitida", p_cliente_nombre: "ACME",
      p_fecha_desde: "2026-01-01", p_fecha_hasta: "2026-01-31", p_limit: 500 };
    expect(mock.supabase.rpc).toHaveBeenNthCalledWith(1, "facturas_listado_pagina", { ...args, p_offset: 0 });
    expect(mock.supabase.rpc).toHaveBeenNthCalledWith(2, "facturas_listado_pagina", { ...args, p_offset: 500 });
  });

  it.each([
    { rows: [], count: 501 },
    { rows: [ROW], count: 502 },
    { rows: [primeraPagina[0]], count: 501 },
  ])("rechaza una exportación parcial o inconsistente", async (segundaPagina) => {
    mock.supabase.rpc
      .mockResolvedValueOnce({ data: { rows: primeraPagina, count: 501 }, error: null })
      .mockResolvedValueOnce({ data: segundaPagina, error: null });
    await expect(fetchFacturasParaExportar({}, scope)).rejects.toThrow(/cambió durante la exportación/);
  });

  it("detiene la lectura si cambia de organización mientras espera una página", async () => {
    mock.supabase.rpc.mockResolvedValueOnce({ data: { rows: primeraPagina, count: 501 }, error: null });
    const assertCurrent = vi.fn().mockImplementationOnce(() => undefined).mockImplementation(() => {
      throw new Error("Cambió la organización");
    });
    await expect(fetchFacturasParaExportar({}, { ...scope, assertCurrent })).rejects.toThrow("Cambió la organización");
    expect(mock.supabase.rpc).toHaveBeenCalledTimes(1);
  });
});

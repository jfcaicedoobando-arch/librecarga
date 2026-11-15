import { describe, it, expect, vi, beforeEach } from "vitest";
const mock = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("@/services/__tests__/_supabaseChainMock");
  return createSupabaseMock();
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: mock.supabase }));
import { fetchFacturasPagina, fetchClientesFacturas } from "../facturasPagina";
import { facturas } from "../../queryKeys";
beforeEach(() => { mock.rpcCalls.length = 0; mock.resetResults(); });
describe("Emitidas: filtros antes de paginar", () => {
  it("mantiene cliente exacto independiente de búsqueda, estado y rango inclusivo", async () => {
    mock.setRpcResult("facturas_listado_pagina", { data: { rows: [{ id: "f-101" }], count: 201 }, error: null });
    const result = await fetchFacturasPagina({ organizationId: "org", clienteNombre: "ACME", search: "F-", estado: "Emitida", fechaDesde: "2026-01-01", fechaHasta: "2026-01-31", page: 1, pageSize: 100 });
    expect(mock.rpcCalls[0]).toEqual({ fn: "facturas_listado_pagina", args: { p_organization_id: "org", p_cliente_nombre: "ACME", p_search: "F-", p_estado: "Emitida", p_fecha_desde: "2026-01-01", p_fecha_hasta: "2026-01-31", p_offset: 100, p_limit: 100 } });
    expect(result).toEqual({ data: [{ id: "f-101" }], count: 201 });
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
});

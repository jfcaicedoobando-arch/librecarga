/**
 * Tests del controller `useFacturacionPageController`.
 * Valida: filtrado por búsqueda y estado y export CSV con headers exactos.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createWrapper } from "@/test/utils/queryWrapper";

const {
  listState, useFacturasListadoMock,
  registrarActividadMutate, toastFn,
  exportToCsvMock, exportarLayoutContableMock,
  notifyErrorMock, notifySuccessMock,
} = vi.hoisted(() => ({
  listState: { search: "", cliente: "todos", estado: "todos", page: 0 },
  useFacturasListadoMock: vi.fn(),
  registrarActividadMutate: vi.fn(),
  toastFn: vi.fn(),
  exportToCsvMock: vi.fn(),
  exportarLayoutContableMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessMock: vi.fn(),
}));

vi.mock("@/features/facturacion/hooks/useFacturas", () => ({
  useFacturasListado: (args: unknown) => useFacturasListadoMock(args),
  useClientesFacturas: () => ({ data: ["ACME", "Beta", "Cliente histórico"] }),
}));
vi.mock("@/hooks/shared", () => ({
  useListPageState: () => {
    return {
      search: listState.search, filters: { estado: listState.estado, cliente: listState.cliente }, page: listState.page, pageSize: 100,
      setSearch: vi.fn(), setFilter: vi.fn(), setPage: vi.fn(), setPageSize: vi.fn(),
    };
  },
  useDebounce: <T,>(v: T) => v,
  useRegistrarActividad: () => ({ mutate: registrarActividadMutate }),
  useToast: () => ({ toast: toastFn }),
  usePermissions: () => ({ canEdit: true }),
}));
vi.mock("@/generators/exportCsv", () => ({ exportToCsv: exportToCsvMock }));
vi.mock("@/generators/layoutContable", () => ({ exportarLayoutContable: exportarLayoutContableMock }));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: notifyErrorMock,
  notifySuccess: notifySuccessMock,
}));

import { useFacturacionPageController } from "../useFacturacionPageController";

const f = (over: Record<string, unknown> = {}) => ({
  id: "f1", numero: "FAC-001", expediente: "EXP-001",
  cliente_nombre: "ACME", total: 1000, moneda: "USD",
  fecha_emision: "2026-01-15", fecha_vencimiento: "2026-02-15",
  estado: "pendiente", ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(listState, { search: "", cliente: "todos", estado: "todos", page: 0 });
  useFacturasListadoMock.mockReturnValue({
    data: { data: [f(), f({ id: "f2", numero: "FAC-002", cliente_nombre: "Beta" })], count: 2 },
    isLoading: false,
  });
});

describe("useFacturacionPageController", () => {
  it("devuelve facturas paginadas cuando no hay filtros", () => {
    const { result } = renderHook(() => useFacturacionPageController(), { wrapper: createWrapper() });
    expect(result.current.paginatedFacturas).toHaveLength(2);
  });

  it("exportarFacturasCsv exporta con los headers esperados", () => {
    const { result } = renderHook(() => useFacturacionPageController(), { wrapper: createWrapper() });
    act(() => result.current.exportarFacturasCsv());
    expect(exportToCsvMock).toHaveBeenCalledTimes(1);
    const [filename, headers, rows] = exportToCsvMock.mock.calls[0];
    expect(filename).toMatch(/^facturas_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(headers.map((h: { key: string }) => h.key)).toEqual([
      "numero", "expediente", "cliente", "total", "moneda", "emision", "vencimiento", "estado",
    ]);
    expect(rows).toHaveLength(2);
  });

  it("exportarLayoutContable propaga error vía notifyError", async () => {
    exportarLayoutContableMock.mockRejectedValueOnce(new Error("fail"));
    const { result } = renderHook(() => useFacturacionPageController(), { wrapper: createWrapper() });
    await act(async () => { await result.current.exportarLayoutContable(); });
    expect(notifyErrorMock).toHaveBeenCalled();
  });
});


describe("filtros globales", () => {
  it("envía ambas fechas al servidor y conserva su conteo aunque la página no esté completa", () => {
    useFacturasListadoMock.mockReturnValue({ data: { data: [f()], count: 201 }, isLoading: false });
    const { result } = renderHook(() => useFacturacionPageController({ fechaDesde: "2026-01-01", fechaHasta: "2026-01-31" }), { wrapper: createWrapper() });
    expect(useFacturasListadoMock).toHaveBeenLastCalledWith(expect.objectContaining({ fechaDesde: "2026-01-01", fechaHasta: "2026-01-31", page: 0, pageSize: 100 }));
    expect(result.current.totalPages).toBe(3);
    expect(result.current.paginatedFacturas).toHaveLength(1);
    expect(result.current.clientesDisponibles).toContainEqual({ id: "Cliente histórico", nombre: "Cliente histórico" });
  });
});


it("cliente seleccionado no reemplaza búsqueda/estado ni filtra otra vez la página", () => {
  Object.assign(listState, { search: "F-01", cliente: "ACME", estado: "Emitida", page: 1 });
  useFacturasListadoMock.mockReturnValue({ data: { data: [f()], count: 201 }, isLoading: false });
  const { result } = renderHook(() => useFacturacionPageController({ fechaDesde: "2026-01-01" }), { wrapper: createWrapper() });
  expect(useFacturasListadoMock).toHaveBeenLastCalledWith(expect.objectContaining({ clienteNombre: "ACME", search: "F-01", estado: "Emitida", page: 1, fechaDesde: "2026-01-01" }));
  expect(result.current.totalCount).toBe(201);
  expect(result.current.clientesDisponibles).toHaveLength(3);
});

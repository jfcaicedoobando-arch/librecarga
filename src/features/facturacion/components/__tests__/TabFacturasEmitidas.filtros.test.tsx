import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TabFacturasEmitidas } from "../TabFacturasEmitidas";
vi.mock("@/hooks/shared", () => ({ usePermissions: () => ({ canEmitirFactura: true }) }));
vi.mock("@/components/shared/dataTable/ResponsiveDataTable", () => ({ ResponsiveDataTable: ({ emptyState }: { emptyState: React.ReactNode }) => emptyState }));
vi.mock("../FacturasMasivasToolbar", () => ({ FacturasMasivasToolbar: () => null }));
vi.mock("../FacturasEmitidasFooter", () => ({ FacturasEmitidasFooter: () => null }));
vi.mock("../DialogDescargarZipMes", () => ({ DialogDescargarZipMes: () => null }));
vi.mock("@/components/shared/filters/UnifiedFiltersBar", () => ({ UnifiedFiltersBar: () => null }));
vi.mock("@/components/empty/EmptyState", () => ({ default: ({ title, primaryAction }: { title: string; primaryAction?: { label: string; onClick: () => void } }) => <div><h2>{title}</h2>{primaryAction && <button onClick={primaryAction.onClick}>{primaryAction.label}</button>}</div> }));
const makeProps = () => ({
  filtros: { search: "", setSearch: vi.fn(), filterEstado: "todos", filterCliente: "todos", setFilter: vi.fn(), fechaDesde: "", setFechaDesde: vi.fn(), fechaHasta: "", setFechaHasta: vi.fn(), clientes: [], onClear: vi.fn() },
  tabla: { columns: [], data: [], facturasFiltradas: [], totalFacturas: 0, isLoading: false, page: 0, totalPages: 1, setPage: vi.fn(), pageSize: 100, setPageSize: vi.fn() },
  acciones: { exportarFacturasCsv: vi.fn(), exportarLayoutContable: vi.fn(), onCreateNew: vi.fn() },
});
describe("Emitidas: vacío filtrado", () => {
  it.each(["filterEstado", "filterCliente", "fechaDesde", "fechaHasta", "search"] as const)("%s ofrece limpiar, no crear otra factura", (field) => {
    const props = makeProps(); props.filtros[field] = field === "filterEstado" ? "Emitida" : "valor";
    render(<TabFacturasEmitidas {...props} />);
    expect(screen.getByRole("heading", { name: "No se encontraron facturas" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nueva factura" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(props.filtros.onClear).toHaveBeenCalledOnce();
  });
  it("el verdadero vacío conserva la acción crear", () => {
    render(<TabFacturasEmitidas {...makeProps()} />);
    expect(screen.getByRole("heading", { name: "Aún no hay facturas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva factura" })).toBeInTheDocument();
  });
});

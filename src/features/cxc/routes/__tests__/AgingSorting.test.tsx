import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import CxcAging from "../CxcAging";
import CxpAging from "@/features/cxp/routes/CxpAging";

const { csv, cxc, cxp } = vi.hoisted(() => ({ csv: vi.fn(), cxc: vi.fn(), cxp: vi.fn() }));
vi.mock("@/lib/ui/notifyCsvExport", () => ({ downloadCsvWithFeedback: csv }));
vi.mock("@/features/cxc/hooks/useCxcAging", () => ({ useCxcAging: cxc }));
vi.mock("@/features/cxp/hooks/useCxpAging", () => ({ useCxpAging: cxp }));
vi.mock("@/components/shared/filters/UnifiedFiltersBar", () => ({ UnifiedFiltersBar: () => null }));
vi.mock("@/features/cxc/components/CxcAgingDrillDownDialog", () => ({
  CxcAgingDrillDownDialog: ({ cliente, cubetaInicial }: { cliente: Row | null; cubetaInicial: string }) =>
    cliente && <output data-testid="detalle">{cliente.cliente_nombre}:{cubetaInicial}</output>,
}));
vi.mock("@/features/cxp/components/AgingDrillDownDialog", () => ({
  AgingDrillDownDialog: ({ proveedor, cubetaInicial }: { proveedor: Row | null; cubetaInicial: string }) =>
    proveedor && <output data-testid="detalle">{proveedor.proveedor_nombre}:{cubetaInicial}</output>,
}));

interface Row { cliente_nombre?: string; proveedor_nombre?: string; saldo_total: number; num_facturas: number }
interface TableProps {
  columns: { id: string; header: string; enableSorting?: boolean }[];
  data: Row[];
  controlledSort: { key: string; dir: "asc" | "desc" };
  onSortChange: (key: string, dir: "asc" | "desc") => void;
  onRowClick: (row: Row) => void;
  pagination: { page: number; onPageChange: (page: number) => void };
}
// Keep actual columns, route comparators and paging hook together. Only replace
// the responsive renderer, so header IDs must reach the real sorters correctly.
vi.mock("@/components/shared/dataTable/ResponsiveDataTable", () => ({
  ResponsiveDataTable: ({ columns, data, controlledSort: sort, onSortChange, onRowClick, pagination }: TableProps) => <>
    {columns.filter(c => c.enableSorting).map(c => <button key={c.id} onClick={() =>
      onSortChange(c.id, sort.key === c.id && sort.dir === "asc" ? "desc" : "asc")}>{c.header}</button>)}
    <output data-testid="orden">{sort.key}:{sort.dir}</output>
    <div data-testid="filas">{data.map(r => <button key={r.cliente_nombre ?? r.proveedor_nombre}
      onClick={() => onRowClick(r)}>{r.cliente_nombre ?? r.proveedor_nombre}</button>)}</div>
    <button onClick={() => pagination.onPageChange(pagination.page + 1)}>Página siguiente</button>
  </>,
}));

// Amounts and counts intentionally have opposite order; alphabetical input is
// also different, so a missing comparator cannot accidentally pass.
const rows = Array.from({ length: 12 }, (_, i) => ({
  moneda: "MXN", saldo_total: (i + 1) * 100, num_facturas: 12 - i,
  vigente: 0, d_1_30: 0, d_31_60: (i + 1) * 100, d_61_90: 0, mas_90: 0,
  cliente_id: `c${i}`, proveedor_id: `p${i}`,
  cliente_nombre: `Entidad ${String(i + 1).padStart(2, "0")}`,
  proveedor_nombre: `Entidad ${String(i + 1).padStart(2, "0")}`,
}));
const state = { isLoading: false, isError: false, error: null, refetch: vi.fn(), monedas: ["MXN"],
  monedaActiva: "MXN", setMoneda: vi.fn(), rowsFiltradas: rows, totales: { ...rows[0], total: 7800 } };
beforeEach(() => { vi.clearAllMocks(); cxc.mockReturnValue(state); cxp.mockReturnValue(state); });
function wrapper(query: string) {
  const Nuqs = withNuqsTestingAdapter({ hasMemory: true, searchParams: query });
  return ({ children }: { children: ReactNode }) => <Nuqs><MemoryRouter>{children}</MemoryRouter></Nuqs>;
}
const names = () => Array.from(screen.getByTestId("filas").querySelectorAll("button")).map(b => b.textContent);
const expected = (descending: boolean) => (descending ? [...rows].reverse() : rows).map(r => r.cliente_nombre);

describe.each([["CxC", CxcAging], ["CxP", CxpAging]] as const)("Ordenamiento Aging %s", (_, Route) => {
  it("conserva Total descendente como orden inicial", () => {
    render(<Route />, { wrapper: wrapper("?ps=10") });
    expect(screen.getByTestId("orden")).toHaveTextContent("saldo:desc");
    expect(names()).toEqual(expected(true).slice(0, 10));
  });
  it.each(["saldo", "facturas"])("conserva enlaces sort=%s en ambas direcciones", (key) => {
    for (const dir of ["asc", "desc"] as const) {
      const view = render(<Route />, { wrapper: wrapper(`?sort=${key}&dir=${dir}&ps=10&page=1`) });
      expect(names()).toEqual(expected(key === "saldo" ? dir === "desc" : dir === "asc").slice(10));
      view.unmount();
    }
  });
  it.each([["Total", "saldo"], ["Facturas", "facturas"]])("ordena %s por encabezado y conserva paginación, detalle y CSV", async (header, key) => {
    render(<Route />, { wrapper: wrapper("?ps=10&cubeta=31_60") });
    fireEvent.click(screen.getByRole("button", { name: header }));
    await waitFor(() => expect(screen.getByTestId("orden")).toHaveTextContent(`${key}:asc`));
    expect(names()).toEqual(expected(key === "facturas").slice(0, 10));
    fireEvent.click(screen.getByRole("button", { name: header }));
    await waitFor(() => expect(screen.getByTestId("orden")).toHaveTextContent(`${key}:desc`));
    const ordered = expected(key === "saldo");
    expect(names()).toEqual(ordered.slice(0, 10));
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    await waitFor(() => expect(names()).toEqual(ordered.slice(10)));
    fireEvent.click(screen.getByRole("button", { name: ordered[10] }));
    expect(screen.getByTestId("detalle")).toHaveTextContent(`${ordered[10]}:d_31_60`);
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(csv).toHaveBeenCalledWith(expect.objectContaining({ rowCount: 12 }));
    const content: string = csv.mock.lastCall?.[0].csv;
    for (let i = 1; i < ordered.length; i++) expect(content.indexOf(ordered[i])).toBeGreaterThan(content.indexOf(ordered[i - 1]));
  });
});

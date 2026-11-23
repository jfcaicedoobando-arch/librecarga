import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { describe, expect, it, vi } from "vitest";
import type { DataTablePagination } from "@/components/shared/dataTable/types";

const fixtures = vi.hoisted(() => ({
  rows: ["Vigente", "Vencida"].flatMap((status) => [
    ...Array.from({ length: 22 }, (_, i) => ({
      id: `${status}-${i}`, numero: `${status}-${i}`, cliente_nombre: i === 0 ? "Cliente buscado" : "Otro cliente",
      saldo: i === 0 ? .005 : .01, moneda: i < 12 ? "USD" : "MXN", estatus_cobranza: status,
      fecha_vencimiento: "2026-10-07", dias_vencido: status === "Vencida" ? 1 : -1,
    })),
    { id: `${status}-ruido`, numero: "Ruido", cliente_nombre: "Otro cliente", saldo: .0049,
      moneda: "EUR", estatus_cobranza: "Sin saldo", fecha_vencimiento: "2026-10-07", dias_vencido: 0 },
  ]),
}));
vi.mock("@/features/facturacion/hooks/useCobranza", () => ({ useCobranzaFilas: () => ({ data: fixtures.rows, isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock("../BandejaShell", () => ({ BandejaShell: ({ children, counter, search, onSearchChange }: {
  children: ReactNode; counter: ReactNode; search: string; onSearchChange: (value: string) => void;
}) => <><div data-testid="counter">{counter}</div><input aria-label="Buscar" value={search} onChange={(e) => onSearchChange(e.target.value)} />{children}</> }));
vi.mock("@/components/shared/dataTable/ResponsiveDataTable", () => ({ ResponsiveDataTable: ({ data, pagination, emptyState }: {
  data: typeof fixtures.rows; pagination: DataTablePagination; emptyState: ReactNode;
}) => <>{data.length > 0 ? <ul>{data.map((r) => <li key={r.id}>{r.numero} {r.moneda}</li>)}</ul> : emptyState}
  <button onClick={() => pagination.onPageChange(1)}>Siguiente</button></> }));
import { BandejaPorCobrar } from "../BandejaPorCobrar";
import { BandejaVencidas } from "../BandejaVencidas";

// Keep the real URL filter/search/pagination hook: these are displayed table counts,
// whereas the navigation RPCs deliberately count the complete tenant portfolio.
describe.each([
  { name: "Por cobrar", Component: BandejaPorCobrar, counters: ["22 de 22", "22 de 22", "12 de 22", "1 de 22", "0 de 22"] },
  { name: "Vencidas", Component: BandejaVencidas, counters: ["1–20 de 22", "21–22 de 22", "1–12 de 12", "1 de 1", "0 de 0"] },
])("AUD141 $name: rows and filtered counter", ({ Component, counters }) => {
  it("counts monetary documents across currencies before pagination", async () => {
    render(<Component />, { wrapper: withNuqsTestingAdapter({ hasMemory: true, searchParams: { ps: "20" } }) });
    expect(screen.getByTestId("counter")).toHaveTextContent(counters[0]);
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    expect(screen.queryByText(/Ruido/)).toBeNull();
    fireEvent.click(screen.getByText("Siguiente"));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    expect(screen.getByTestId("counter")).toHaveTextContent(counters[1]);
  });
  it("currency and search filters count exactly their rows, preserving the full bucket denominator", async () => {
    render(<Component />, { wrapper: withNuqsTestingAdapter({ hasMemory: true, searchParams: { moneda: "USD" } }) });
    expect(screen.getByTestId("counter")).toHaveTextContent(counters[2]);
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    expect(screen.getAllByRole("listitem").every((row) => row.textContent?.endsWith("USD"))).toBe(true);
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "Cliente buscado" } });
    await waitFor(() => expect(screen.getByTestId("counter")).toHaveTextContent(counters[3]));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "No coincide" } });
    await waitFor(() => expect(screen.getByTestId("counter")).toHaveTextContent(counters[4]));
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});

it("distingue una búsqueda sin coincidencias de una cartera al día", async () => {
  render(<BandejaVencidas />, { wrapper: withNuqsTestingAdapter({ hasMemory: true, searchParams: { q: "No coincide" } }) });
  expect(screen.getByText("Ninguna factura vencida coincide con los filtros.")).toBeInTheDocument();
  expect(screen.queryByText(/todas las facturas están al día/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
  await waitFor(() => expect(screen.getByTestId("counter")).toHaveTextContent("1–22 de 22"));
});

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import Facturacion from "../Facturacion";

vi.mock("@/hooks/shared", () => ({
  usePermissions: () => ({ canEmitirFactura: false }),
  useDocumentTitle: vi.fn(),
}));
vi.mock("@/features/facturacion/hooks", async () => ({
  useFacturacionDateRange: (await import("../../hooks/useFacturacionDateRange")).useFacturacionDateRange,
  useFacturacionPageController: () => ({
    search: "",
    setSearch: vi.fn(),
    setFilter: vi.fn(),
    setPage: vi.fn(),
    setPageSize: vi.fn(),
    paginatedFacturas: [],
    facturasFiltradas: [],
    clientesDisponibles: [],
  }),
}));
vi.mock(
  "@/features/facturacion/components/DashboardEjecutivoFacturacion",
  () => ({ DashboardEjecutivoFacturacion: () => null }),
);
vi.mock("@/features/facturacion/components/FacturacionDialogs", () => ({
  FacturacionDialogs: () => null,
}));
vi.mock("../facturacionColumns", () => ({ buildFacturaColumns: () => [] }));
vi.mock(
  "@/features/facturacion/components/bandejas/FacturacionBandejasTabs",
  () => ({
    FacturacionBandejasTabs: ({
      setActiveBandeja, emitidas,
    }: {
      setActiveBandeja: (id: string) => void;
      emitidas: { filtros: { onClear: () => void } };
    }) => (
      <>
        <button onClick={() => setActiveBandeja("vencidas")}>Abrir vencidas</button>
        <button onClick={() => setActiveBandeja("emitidas")}>Abrir emitidas</button>
        <button onClick={emitidas.filtros.onClear}>Limpiar filtros</button>
      </>
    ),
  }),
);
function CurrentUrl() {
  const location = useLocation();
  return <output data-testid="url">{location.search}</output>;
}

describe("Facturacion bucket URL pagination", () => {
  it("muestra el periodo sólo en Emitidas y conserva el rango al volver", () => {
    render(
      <MemoryRouter initialEntries={["/facturacion?desde=2026-10-04&hasta=2026-10-07"]}>
        <Facturacion />
        <CurrentUrl />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("combobox", { name: "Periodo de emisión" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir emitidas" }));
    expect(screen.getByRole("combobox", { name: "Periodo de emisión" })).toHaveTextContent("Personalizado");
    fireEvent.click(screen.getByRole("button", { name: "Abrir vencidas" }));
    expect(screen.queryByRole("combobox", { name: "Periodo de emisión" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir emitidas" }));
    expect(screen.getByRole("combobox", { name: "Periodo de emisión" })).toHaveTextContent("Personalizado");
    expect(screen.getByTestId("url")).toHaveTextContent("desde=2026-10-04&hasta=2026-10-07&bandeja=emitidas");
  });

  it("resets page on bucket selection and preserves search, currency and page size", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          "/facturacion?bandeja=por-cobrar&page=1&ps=20&q=cliente&moneda=EUR",
        ]}
      >
        <Facturacion />
        <CurrentUrl />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir vencidas" }));
    await waitFor(() =>
      expect(screen.getByTestId("url")).toHaveTextContent("bandeja=vencidas"),
    );
    const params = new URLSearchParams(
      screen.getByTestId("url").textContent ?? "",
    );
    expect(params.has("page")).toBe(false);
    expect(params.get("ps")).toBe("20");
    expect(params.get("q")).toBe("cliente");
    expect(params.get("moneda")).toBe("EUR");
  });
});


it("limpia todos los filtros de una vez conservando bandeja y tamaño", async () => {
  render(<MemoryRouter initialEntries={["/facturacion?bandeja=emitidas&page=3&ps=50&q=ACME&cliente=ACME&estado=Emitida&desde=2026-10-01&hasta=2026-10-31"]}><Facturacion /><CurrentUrl /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
  await waitFor(() => expect(screen.getByTestId("url").textContent).toBe("?bandeja=emitidas&ps=50"));
});

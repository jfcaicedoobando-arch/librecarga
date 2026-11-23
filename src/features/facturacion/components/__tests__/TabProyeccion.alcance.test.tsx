import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TabProyeccion } from "../TabProyeccion";

const state = vi.hoisted(() => ({ cliente: "Cliente A", consultando: false, error: null as Error | null, refetch: vi.fn() }));
vi.mock("@/features/facturacion/hooks", () => ({ useTabProyeccionController: () => ({
  kpis: { totalExpedientes: state.cliente === "todos" ? 4 : 2, facturados: 1, avancePct: 50, ventaFacturadaUsd: 100, ventaFacturadaMxn: 2000, pendientes: 1, ventaPendienteUsd: 50, ventaPendienteMxn: 1000, ventaProyUsd: 150, ventaProyMxn: 3000, costoTotalMxn: 2500, margenProyPct: 16.67, profitProyMxn: 500 },
  kpisGlobales: { totalExpedientes: 4 }, mesActual: { key: "2026-09", label: "septiembre 2026" }, mesesDisponibles: [{ key: "2026-09", label: "septiembre 2026" }],
  filtroCliente: state.cliente, filtroOperador: "todos", filtroEstado: "todos", clientesDisponibles: ["Cliente A"], operadoresDisponibles: [], grupos: [],
  isLoading: false, isFetching: state.consultando, error: state.error, refetch: state.refetch,
  setFiltroCliente: vi.fn(), setFiltroOperador: vi.fn(), setFiltroEstado: vi.fn(), setMesKey: vi.fn(), irMesAnterior: vi.fn(), irMesSiguiente: vi.fn(), exportarCsv: vi.fn(),
}) }));

describe("Cierre mensual - ámbito de filtros", () => {
  it("omite las cifras durante actualización y error, y muestra el resultado tras reintentar", () => {
    state.consultando = true;
    const { rerender } = render(<MemoryRouter><TabProyeccion /></MemoryRouter>);
    expect(screen.getByRole("status", { name: "Consultando el cierre mensual" })).toBeInTheDocument();
    expect(screen.queryByText("Avance de facturación")).not.toBeInTheDocument();
    expect(screen.queryByText(/Sin embarques con ETA/)).not.toBeInTheDocument();

    state.consultando = false;
    state.error = new Error("Sin conexión");
    rerender(<MemoryRouter><TabProyeccion /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el cierre mensual");
    expect(screen.queryByText("Avance de facturación")).not.toBeInTheDocument();
    expect(screen.queryByText(/Sin embarques con ETA/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(state.refetch).toHaveBeenCalledOnce();

    state.error = null;
    rerender(<MemoryRouter><TabProyeccion /></MemoryRouter>);
    expect(screen.getByText("Avance de facturación")).toBeInTheDocument();
  });

  it("identifica dos de cuatro y devuelve los títulos mensuales al limpiar filtros", () => {
    state.cliente = "Cliente A";
    const { rerender } = render(<MemoryRouter><TabProyeccion /></MemoryRouter>);
    expect(screen.getByText("2 de 4 expedientes con ETA en septiembre 2026 (filtros aplicados)")).toBeInTheDocument();
    expect(screen.getByText("Proyectado (resultados filtrados)")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Mes del reporte" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar filtro de cliente" })).toBeInTheDocument();
    state.cliente = "todos";
    rerender(<MemoryRouter><TabProyeccion /></MemoryRouter>);
    expect(screen.getByText("4 expedientes con ETA en septiembre 2026")).toBeInTheDocument();
    expect(screen.getByText("Proyectado (total del mes)")).toBeInTheDocument();
  });
});

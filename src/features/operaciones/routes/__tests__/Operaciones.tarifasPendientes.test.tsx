import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Operaciones from "@/features/operaciones/routes/Operaciones";

const mockController = {
  periodo: "mes", setPeriodo: vi.fn(),
  operadorChart: "todos", setOperadorChart: vi.fn(),
  isLoading: false, isError: false, refetch: vi.fn(),
  operadores: [], global: {
    totalActivas: 0, totalContenedores: 0, totalProfit: 0, totalCriticos: 0,
    totalEnPuerto: 0, activasHoy: 0,
  },
  hoyStr: "hoy", chartData: [],
  creadasEsteMes: 0, llegadasEsteMes: 0, balancePct: null as number | null, contPct: 0, totalAlertas: 0,
};
vi.mock("@/features/operaciones/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/operaciones/hooks")>();
  return { ...actual, useOperacionesPageController: () => mockController };
});

const mockUseTarifasPendientes = vi.fn();
vi.mock("@/features/costeo/hooks/useTarifasPendientesAprobacion", () => ({
  useTarifasPendientesAprobacion: () => mockUseTarifasPendientes(),
}));

function renderPage() {
  return render(<MemoryRouter><Operaciones /></MemoryRouter>);
}

describe("Operaciones - tarjeta Tarifas pendientes", () => {
  beforeEach(() => mockUseTarifasPendientes.mockReset());

  it("muestra 5 y enlaza a /costeo/tarifas?aprobacion=borrador", () => {
    mockUseTarifasPendientes.mockReturnValue({
      data: 5, isLoading: false, isError: false, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText("5")).toBeInTheDocument();
    const link = screen.getByText("Tarifas pendientes").closest("a");
    expect(link).toHaveAttribute("href", "/costeo/tarifas?aprobacion=borrador");
    // La semántica NO promete "aprobables": incluye vencidas que hay que revisar/renovar.
    expect(screen.getByText("Requieren revisión")).toBeInTheDocument();
  });

  it("en error muestra reintentar y NO muestra 0", () => {
    mockUseTarifasPendientes.mockReturnValue({
      data: undefined, isLoading: false, isError: true, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText("No se pudo cargar")).toBeInTheDocument();
    expect(screen.getByText("Reintentar")).toBeInTheDocument();
    expect(screen.queryByText("Tarifas pendientes")?.closest("a")).toBeNull();
  });

  it("en loading no muestra 0", () => {
    mockUseTarifasPendientes.mockReturnValue({
      data: undefined, isLoading: true, isError: false, refetch: vi.fn(),
    });
    renderPage();
    expect(screen.queryByText("No se pudo cargar")).not.toBeInTheDocument();
    expect(screen.queryByText("5")).not.toBeInTheDocument();
  });
});

it("explica el balance sin ETD y distingue el alcance del operador y la cifra global", () => {
  mockUseTarifasPendientes.mockReturnValue({ data: 0 });
  renderPage();
  expect(screen.getByText("Sin ETD este mes")).toBeVisible();
  expect(screen.queryByRole("progressbar", { name: "Balance ETD/llegadas" })).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Operador de la tendencia" })).toBeVisible();
  expect(screen.getByText("Activas hoy · toda la organización")).toBeVisible();
});

it("anuncia el porcentaje real aunque el indicador visual esté lleno", () => {
  mockUseTarifasPendientes.mockReturnValue({ data: 0 });
  mockController.balancePct = 120;
  try {
    renderPage();
    const balance = screen.getByRole("progressbar", { name: "Balance ETD/llegadas" });
    expect(balance).toHaveAttribute("aria-valuenow", "100");
    expect(balance).toHaveAttribute("aria-valuetext", "120%");
    expect(screen.getByText("120%")).toBeVisible();
  } finally {
    mockController.balancePct = null;
  }
});

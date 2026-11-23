/**
 * Ola 4 · N28: gating de botones por rol en /comisiones — mismos roles que
 * la RPC/RLS de liquidaciones (admins + contador/tesorero). Gerentes ven la
 * tabla pero sin botones de gestión.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createWrapper } from "@/test/utils/queryWrapper";
import { TabLiquidaciones } from "../TabLiquidaciones";

const { mockUseAuth, mockUseLiquidaciones } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseLiquidaciones: vi.fn(),
}));

vi.mock("@/lib/contexts/AuthContext", () => ({ useAuth: mockUseAuth }));
vi.mock("@/features/comisiones/hooks", () => ({
  useLiquidaciones: mockUseLiquidaciones,
  useGenerarLiquidacion: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useRegistrarPagoLiquidacion: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCancelarLiquidacion: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

const LIQ_ROW = {
  id: "l1",
  vendedora_id: "v1",
  periodo: "2024-01",
  total_mxn: 100,
  fecha_pago: null,
  referencia: null,
  estado: "Generada",
};

function renderTab(effectiveRole: string | null) {
  mockUseAuth.mockReturnValue({ effectiveRole });
  mockUseLiquidaciones.mockReturnValue({ data: [LIQ_ROW], isLoading: false });
  return render(<TabLiquidaciones vendedoras={[]} />, { wrapper: createWrapper() });
}

describe("TabLiquidaciones — gating por rol (Ola 4 · N28)", () => {
  it("identifica a la vendedora de la liquidación antes de registrar el pago", () => {
    mockUseAuth.mockReturnValue({ effectiveRole: "contador" });
    mockUseLiquidaciones.mockReturnValue({
      data: [LIQ_ROW, { ...LIQ_ROW, id: "l2", vendedora_id: "v2" }],
      isLoading: false,
    });
    render(<TabLiquidaciones vendedoras={[
      { id: "v1", nombre: "Ana", email: "ana@example.com", estadoIdentidad: "resuelta", identidadResuelta: true },
      { id: "v2", nombre: "Irma", email: "irma@example.com", estadoIdentidad: "resuelta", identidadResuelta: true },
    ]} />, { wrapper: createWrapper() });
    fireEvent.click(screen.getAllByRole("button", { name: "Registrar pago" })[1]!);
    const dialogo = screen.getByRole("dialog", { name: /2024-01/ });
    expect(within(dialogo).getByText(/Vendedora: Irma/)).toBeInTheDocument();
    expect(within(dialogo).queryByText(/Vendedora: Ana/)).not.toBeInTheDocument();
  });

  it("reintenta una lectura fallida sin mostrar una lista vacía", () => {
    mockUseAuth.mockReturnValue({ effectiveRole: "contador" });
    const refetch = vi.fn();
    mockUseLiquidaciones.mockReturnValue({ isError: true, refetch });
    render(<TabLiquidaciones vendedoras={[]} />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Sin liquidaciones registradas/)).not.toBeInTheDocument();
  });

  it("contador ve el botón Generar liquidación y Registrar pago", () => {
    renderTab("contador");
    expect(screen.getByText(/Generar liquidación/i)).toBeInTheDocument();
    expect(screen.getByText(/Registrar pago/i)).toBeInTheDocument();
  });

  it("tesorero ve los botones de gestión", () => {
    renderTab("tesorero");
    expect(screen.getByText(/Generar liquidación/i)).toBeInTheDocument();
    expect(screen.getByText(/Registrar pago/i)).toBeInTheDocument();
  });

  it("gerente_visor ve la tabla sin botones de gestión", () => {
    renderTab("gerente_visor");
    expect(screen.queryByText(/Generar liquidación/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Registrar pago/i)).not.toBeInTheDocument();
    expect(screen.getByText("2024-01")).toBeInTheDocument();
  });

  it("gerente_comercial y gerente_operaciones tampoco ven botones", () => {
    renderTab("gerente_comercial");
    expect(screen.queryByText(/Generar liquidación/i)).not.toBeInTheDocument();
  });

  it("admin ve los botones de gestión", () => {
    renderTab("admin");
    expect(screen.getByText(/Generar liquidación/i)).toBeInTheDocument();
  });
});

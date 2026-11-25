import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { CostoVsRealPanel } from "../fase6/CostoVsRealPanel";
import { CostoVsRealPricing } from "../fase6/CostoVsRealPricing";
import type { ResumenCostoReal } from "@/features/crm/services/pricing/costoVsRealPricing";

const mocks = vi.hoisted(() => ({
  costos: vi.fn(), refetch: vi.fn(),
}));

vi.mock("@/features/crm/hooks/useRecotizarPricing", () => ({
  useCostoVsReal: mocks.costos,
  useListaCostoReal: () => ({ data: { filas: [{ id: "solicitud", folio: "PR-100" }], total: 1 } }),
}));
vi.mock("@/features/crm/hooks/usePricingCrm", () => ({ useUsuariosOrgCrm: () => ({ data: [] }) }));

const resumen: ResumenCostoReal = {
  estado: "con_resultado", cotizacionFolio: "COT-100", expediente: "EXP-100",
  monedas: [{ moneda: "MXN", cotizado: 100, real: 90, diferencia: -10, pct: -10 }],
};
const error = { isError: true, refetch: mocks.refetch };

describe("Comparación de costos", () => {
  it("distingue la carga, el error y la falta de una cotización confirmada", () => {
    mocks.costos.mockReturnValue({ isLoading: true });
    const { rerender } = render(<CostoVsRealPanel />, { wrapper: MemoryRouter });
    expect(screen.getByText("Calculando…")).toBeVisible();

    mocks.costos.mockReturnValue(error);
    rerender(<CostoVsRealPanel />);
    expect(screen.getByText("Comparación no disponible")).toBeVisible();
    expect(screen.queryByText("Sin cotización")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.refetch).toHaveBeenCalledOnce();

    mocks.costos.mockReturnValue({ data: new Map(), isSuccess: true });
    rerender(<CostoVsRealPanel />);
    expect(screen.getByText("Sin cotización")).toBeVisible();
  });

  it("conserva los resultados previos cuando falla el detalle y permite reintentar", () => {
    mocks.costos.mockReturnValue({ ...error, data: new Map([["solicitud", resumen]]) });
    const { rerender } = render(<CostoVsRealPricing solicitudId="solicitud" />, { wrapper: MemoryRouter });
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getByText("Con facturas")).toBeVisible();
    expect(screen.getByText(/No se pudo calcular/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.refetch).toHaveBeenCalled();

    mocks.costos.mockReturnValue(error);
    rerender(<CostoVsRealPricing solicitudId="solicitud" />);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

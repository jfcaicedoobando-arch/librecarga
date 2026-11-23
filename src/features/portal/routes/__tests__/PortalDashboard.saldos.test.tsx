import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import PortalDashboard from "../PortalDashboard";

const { consultarSaldos, reintentarSaldos, reintentarEmbarques } = vi.hoisted(() => ({
  consultarSaldos: vi.fn(),
  reintentarSaldos: vi.fn(),
  reintentarEmbarques: vi.fn(),
}));

vi.mock("@/hooks/shared", () => ({ useDocumentTitle: vi.fn() }));
vi.mock("@/features/portal/hooks", () => ({
  usePortalClientUsers: () => ({ data: [{ cliente_id: "qa", cliente_nombre: "Cliente QA" }] }),
  usePortalClienteName: () => ({ data: "Cliente QA" }),
  usePortalContactoNombre: () => ({}),
  usePortalOrgName: () => ({}),
  usePortalCotizaciones: () => ({ data: [] }),
  usePortalEmbarques: () => ({ data: [], refetch: reintentarEmbarques }),
  usePortalDashboardKpis: () => ({ embarquesActivos: [], proximosArribos: [], estadoDistribucion: [] }),
}));
vi.mock("@/features/facturacion/estadoCuenta/hooks/useEstadoCuenta", () => ({
  useEstadoCuenta: consultarSaldos,
}));
vi.mock("@/features/portal/components/SolicitarCotizacionDialog", () => ({
  SolicitarCotizacionDialog: () => null,
}));

const dashboard = <MemoryRouter><PortalDashboard /></MemoryRouter>;
const kpis = (cantidad: number) => ({
  adeudado: { mxn: cantidad * 250, usd: 0, eur: 0 },
  facturasAdeudadas: cantidad,
  facturasVencidas: 0,
});

describe("Portal · saldos del cliente", () => {
  it("separa el error de un saldo confirmado en cero y permite reintentar sólo saldos", () => {
    consultarSaldos.mockReturnValue({ hasData: false, isError: true, refetch: reintentarSaldos, kpis: kpis(0) });
    const view = render(dashboard);
    const saldos = within(screen.getByRole("region", { name: "Facturación pendiente" }));
    expect(screen.getByText("N/D")).toBeVisible();
    expect(saldos.getByRole("alert")).toHaveTextContent("No pudimos consultar tus saldos");
    expect(saldos.queryByText("Sin facturas pendientes.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Solicitar cotización" })).toBeEnabled();
    fireEvent.click(saldos.getByRole("button", { name: "Reintentar" }));
    expect(reintentarSaldos).toHaveBeenCalledOnce();
    expect(reintentarEmbarques).not.toHaveBeenCalled();

    consultarSaldos.mockReturnValue({ hasData: true, kpis: kpis(0) });
    view.rerender(<MemoryRouter><PortalDashboard /></MemoryRouter>);
    expect(saldos.getByText("Sin facturas pendientes.")).toBeVisible();
    expect(screen.queryByText("N/D")).not.toBeInTheDocument();
  });

  it("conserva el último saldo y explica su antigüedad si falla la actualización", () => {
    consultarSaldos.mockReturnValue({ hasData: true, isError: true, kpis: kpis(1) });
    render(dashboard);
    const saldos = within(screen.getByRole("region", { name: "Facturación pendiente" }));
    expect(saldos.getByRole("alert")).toHaveTextContent("Se muestran los saldos de la última consulta exitosa.");
    expect(saldos.getByText("1 factura por pagar")).toBeVisible();
  });
});

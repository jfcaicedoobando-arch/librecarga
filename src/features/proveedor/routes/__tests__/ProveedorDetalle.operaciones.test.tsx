import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { formatCurrency } from "@/lib/formatters";
import ProveedorDetalle from "../ProveedorDetalle";

const { controlador } = vi.hoisted(() => ({ controlador: vi.fn() }));
vi.mock("@/features/proveedor/hooks", () => ({ useProveedorDetalleController: controlador }));
vi.mock("@/features/catalogos/hooks", () => ({ useExchangeRates: () => ({}) }));
vi.mock("@/hooks/shared/usePermissions", () => ({ usePermissions: () => ({}) }));
vi.mock("@/features/proveedor/components/EditarProveedorDialog", () => ({ default: () => null }));
vi.mock("@/features/anticipos-proveedor/components/ProveedorAnticiposCard", () => ({ ProveedorAnticiposCard: () => null }));
vi.mock("../../components/ProveedorDetalleHeader", () => ({
  ProveedorDetalleHeader: ({ nombreFmt }: { nombreFmt: string }) => <h1>{nombreFmt}</h1>,
}));

const base = {
  proveedor: { id: "prov-qa", nombre: "Servicios QA", rfc: "QA" },
  partidas: [],
  huerfanas: [],
  brecha: { totalPartidas: 0, partidasPendientes: 0, porFacturarPorMoneda: {} },
  agregados: { porMoneda: {}, monedasSinTc: [] },
  totalFacturado: 0,
  totalPagado: 0,
  totalPendiente: 0,
};

function pantalla() {
  return <MemoryRouter><ProveedorDetalle /></MemoryRouter>;
}

describe("Saldos y operaciones del proveedor", () => {
  it("mantiene la ficha visible y no anuncia cero antes de confirmar operaciones", () => {
    controlador.mockReturnValue({ ...base, isLoadingEstadoCuenta: true });
    const vista = render(pantalla());
    expect(screen.getByRole("heading", { name: /Servicios QA/i })).toBeVisible();
    expect(screen.getByText("Cargando saldos y operaciones del proveedor…")).toBeVisible();
    expect(screen.getByText("Cargando operaciones del proveedor…")).toBeVisible();
    expect(screen.queryByText("Sin operaciones registradas")).not.toBeInTheDocument();
    expect(screen.queryByText(formatCurrency(0, "MXN"))).not.toBeInTheDocument();

    controlador.mockReturnValue({ ...base, isLoadingEstadoCuenta: false });
    vista.rerender(pantalla());
    expect(screen.getByText("Sin operaciones registradas")).toBeVisible();
    expect(screen.getAllByText(formatCurrency(0, "MXN"))).toHaveLength(3);
  });
});

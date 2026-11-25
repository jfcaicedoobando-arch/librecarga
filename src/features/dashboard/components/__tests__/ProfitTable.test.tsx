import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";

const { mockPermissions, esMovil } = vi.hoisted(() => ({ mockPermissions: vi.fn(), esMovil: vi.fn() }));
vi.mock("@/hooks/shared/usePermissions", () => ({
  usePermissions: () => mockPermissions(),
}));
vi.mock("@/hooks/shared/useIsMobile", () => ({ useIsMobile: esMovil }));

import { ProfitTable } from "../ProfitTable";
import type { EmbarqueConProfit } from "@/features/dashboard/hooks";
import { formatCurrency } from "@/lib/formatters";

const embarque = {
  id: "e1",
  expediente: "ELIMP00001",
  cliente_nombre: "Cliente Demo",
  ventaMXN: 10_000,
  costoMXN: 7_000,
  profitMXN: 3_000,
  margenMXN: 30,
  ventaMxnFromUsd: 0,
  costoMxnFromUsd: 0,
  ventaMxnFromEur: 0,
  costoMxnFromEur: 0,
  ventaMxnNative: 10_000,
  costoMxnNative: 7_000,
  tipoCambioUSD: 18,
  tipoCambioEUR: 20,
} as unknown as EmbarqueConProfit;

const otroEmbarque = { ...embarque, id: "e2", expediente: "ELIMP00002", costoMXN: 9_500 };
function RutaActual() {
  const { pathname } = useLocation();
  return <output aria-label="Ruta actual">{pathname}</output>;
}

function renderTabla(embarques = [embarque]) {
  return render(
    <MemoryRouter>
      <RutaActual />
      <ProfitTable embarques={embarques} isLoading={false} />
    </MemoryRouter>,
  );
}

describe("ProfitTable (QA B-07)", () => {
  beforeEach(() => esMovil.mockReturnValue(false));

  it("muestra costo, utilidad y margen a quien puede ver costos", () => {
    mockPermissions.mockReturnValue({ canViewCosts: true });
    renderTabla();
    expect(screen.getByText("Costo MXN")).toBeInTheDocument();
    expect(screen.getByText("Utilidad MXN")).toBeInTheDocument();
    expect(screen.getByText("Margen")).toBeInTheDocument();
  });

  it("modo solo ventas: oculta costo, utilidad y margen a roles comerciales", () => {
    mockPermissions.mockReturnValue({ canViewCosts: false });
    renderTabla();
    expect(screen.getByText("Venta MXN")).toBeInTheDocument();
    expect(screen.queryByText("Costo MXN")).not.toBeInTheDocument();
    expect(screen.queryByText("Utilidad MXN")).not.toBeInTheDocument();
    expect(screen.queryByText("Margen")).not.toBeInTheDocument();
  });

  it("conserva el ciclo de orden en los encabezados de escritorio", () => {
    mockPermissions.mockReturnValue({ canViewCosts: true });
    renderTabla([embarque, otroEmbarque]);
    const header = screen.getByRole("columnheader", { name: "Utilidad MXN" });
    const ordenar = within(header).getByRole("button", { name: "Utilidad MXN" });
    expect(header).toHaveAttribute("aria-sort", "none");
    fireEvent.click(ordenar);
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(screen.getAllByRole("link")[0]).toHaveTextContent("ELIMP00001");
    fireEvent.click(ordenar);
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getAllByRole("link")[0]).toHaveTextContent("ELIMP00002");
    fireEvent.click(ordenar);
    expect(header).toHaveAttribute("aria-sort", "none");
    expect(screen.getAllByRole("link")[0]).toHaveTextContent("ELIMP00001");
  });

  it("muestra importes, margen y cliente completos en tarjetas que abren el embarque", () => {
    esMovil.mockReturnValue(true);
    mockPermissions.mockReturnValue({ canViewCosts: true });
    renderTabla();
    const tarjeta = screen.getByRole("link", { name: /ELIMP00001/ });
    expect(tarjeta).toHaveTextContent("Cliente Demo");
    expect(tarjeta).toHaveTextContent("Margen");
    expect(tarjeta).toHaveTextContent(formatCurrency(10_000, "MXN"));
    expect(tarjeta).toHaveTextContent(formatCurrency(7_000, "MXN"));
    expect(tarjeta).toHaveTextContent(formatCurrency(3_000, "MXN"));
    expect(within(tarjeta).queryByRole("button")).not.toBeInTheDocument();
    fireEvent.keyDown(tarjeta, { key: "Enter" });
    expect(screen.getByLabelText("Ruta actual")).toHaveTextContent("/embarques/e1");
  });

  it("ordena las tarjetas por margen y utilidad y puede restablecer el orden del listado", () => {
    esMovil.mockReturnValue(true);
    mockPermissions.mockReturnValue({ canViewCosts: true });
    renderTabla([embarque, otroEmbarque]);
    const ordenar = (opcion: string) => {
      fireEvent.keyDown(screen.getByRole("combobox", { name: "Ordenar arribos" }), { key: "ArrowDown" });
      fireEvent.click(screen.getByRole("option", { name: opcion }));
    };
    expect(screen.getAllByRole("link")[0]).toHaveTextContent("ELIMP00001");
    ordenar("Menor margen");
    expect(screen.getAllByRole("link")[0]).toHaveTextContent("ELIMP00002");
    ordenar("Mayor utilidad");
    expect(screen.getAllByRole("link")[0]).toHaveTextContent("ELIMP00001");
    ordenar("Orden predeterminado");
    expect(screen.getAllByRole("link")[0]).toHaveTextContent("ELIMP00001");
  });

  it("en móvil reserva montos, margen y orden financiero a quien puede ver costos", () => {
    esMovil.mockReturnValue(true);
    mockPermissions.mockReturnValue({ canViewCosts: false });
    renderTabla([embarque, otroEmbarque]);
    const tarjeta = screen.getByRole("link", { name: /ELIMP00001/ });
    expect(tarjeta).toHaveTextContent("Venta MXN");
    expect(tarjeta).not.toHaveTextContent(/Costo|Utilidad|Margen/);
    expect(screen.queryByRole("combobox", { name: "Ordenar arribos" })).not.toBeInTheDocument();
  });
});

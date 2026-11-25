import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { FacturaCxP } from "@/features/cxp/services";
import { FacturaProveedorTabs } from "../FacturaProveedorTabs";

const { consultar, reintentar, mobile, cancelar } = vi.hoisted(() => ({
  consultar: vi.fn(), reintentar: vi.fn(), mobile: vi.fn(() => false), cancelar: vi.fn(),
}));
vi.mock("@/hooks/shared/useIsMobile", () => ({ useIsMobile: mobile }));
vi.mock("@/features/cxp/hooks/useNotasCreditoProveedor", () => ({
  useNotasCreditoFactura: consultar,
  useAplicarNotaCredito: () => ({}),
  useAprobarNotaCredito: () => ({}),
  useCancelarNotaCredito: () => ({ mutateAsync: cancelar }),
}));
vi.mock("@/features/cxp/hooks/useConceptosCfdiFactura", () => ({ useConceptosCfdiFactura: () => ({ data: [] }) }));
vi.mock("@/features/cxp/components/DialogEditarPagoProveedor", () => ({ DialogEditarPagoProveedor: () => null }));
vi.mock("@/features/cxp/components/DialogNotaCreditoProveedor", () => ({ DialogNotaCreditoProveedor: () => null }));
vi.mock("@/features/cxp/components/NcSatBadge", () => ({ NcSatBadge: () => null }));

const factura = { id: "f-qa", moneda: "MXN", saldo: 200 } as FacturaCxP;
const pagos = { isLoading: false, isError: false, isFetching: false, data: [], refetch: vi.fn() };
const nota = { id: "n-qa", folio_nc: "NC-QA", fecha: "2026-10-04", monto: 200, moneda: "MXN", estado: "Aplicada" };

function pantalla(canEdit = false) {
  return (
    <MemoryRouter initialEntries={["/compras/facturas/f-qa?tab=notas-credito"]}>
      <FacturaProveedorTabs factura={factura} consultaPagos={pagos} canEdit={canEdit} onEliminarPago={vi.fn()} />
    </MemoryRouter>
  );
}

describe("Notas de crédito de una factura de proveedor", () => {
  it("conserva el permiso y la confirmación al cancelar desde una tarjeta móvil", () => {
    mobile.mockReturnValue(true);
    consultar.mockReturnValue({ data: [nota], isError: false });
    const vista = render(pantalla());
    expect(screen.getByText("NC-QA")).toBeVisible();
    expect(screen.getByText("Aplicada")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Acciones de la nota NC-QA" })).not.toBeInTheDocument();
    vista.rerender(pantalla(true));
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la nota NC-QA" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancelar nota de crédito" }));
    const dialogo = screen.getByRole("alertdialog", { name: "¿Cancelar la nota de crédito?" });
    expect(within(dialogo).getByRole("button", { name: "Sí, cancelar NC" })).toBeEnabled();
    expect(cancelar).not.toHaveBeenCalled();
    mobile.mockReturnValue(false);
  });

  it("distingue el fallo de la ausencia y conserva el reintento", () => {
    consultar.mockReturnValue({ data: [nota], isError: true, refetch: reintentar });
    const vista = render(pantalla());
    expect(screen.getByRole("tab", { name: "Notas de crédito" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las notas de crédito");
    expect(screen.queryByText("Sin notas de crédito registradas.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reintentar).toHaveBeenCalledOnce();

    consultar.mockReturnValue({ data: [nota], isError: false });
    vista.rerender(pantalla());
    expect(screen.getByRole("tab", { name: /^Notas de crédito\s*1$/ })).toBeVisible();
    expect(screen.getByText("NC-QA")).toBeVisible();
  });
});

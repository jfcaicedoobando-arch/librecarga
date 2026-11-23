import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { FacturaCxP } from "@/features/cxp/services";
import { FacturaProveedorTabs } from "../FacturaProveedorTabs";

const { consultar, reintentar } = vi.hoisted(() => ({ consultar: vi.fn(), reintentar: vi.fn() }));
vi.mock("@/features/cxp/hooks/useNotasCreditoProveedor", () => ({
  useNotasCreditoFactura: consultar,
  useAplicarNotaCredito: () => ({}),
  useAprobarNotaCredito: () => ({}),
  useCancelarNotaCredito: () => ({}),
}));
vi.mock("@/features/cxp/hooks/useConceptosCfdiFactura", () => ({ useConceptosCfdiFactura: () => ({ data: [] }) }));
vi.mock("@/features/cxp/components/DialogEditarPagoProveedor", () => ({ DialogEditarPagoProveedor: () => null }));
vi.mock("@/features/cxp/components/DialogNotaCreditoProveedor", () => ({ DialogNotaCreditoProveedor: () => null }));
vi.mock("@/features/cxp/components/NotaCreditoFila", () => ({
  NotaCreditoFila: ({ nota }: { nota: { folio_nc: string } }) => <tr><td>{nota.folio_nc}</td></tr>,
}));

const factura = { id: "f-qa", moneda: "MXN", saldo: 200 } as FacturaCxP;
const pagos = { isLoading: false, isError: false, isFetching: false, data: [], refetch: vi.fn() };
const nota = { id: "n-qa", folio_nc: "NC-QA", estado: "Aplicada" };

function pantalla() {
  return (
    <MemoryRouter initialEntries={["/compras/facturas/f-qa?tab=notas-credito"]}>
      <FacturaProveedorTabs factura={factura} consultaPagos={pagos} canEdit={false} onEliminarPago={vi.fn()} />
    </MemoryRouter>
  );
}

describe("Notas de crédito de una factura de proveedor", () => {
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

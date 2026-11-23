import { fireEvent, render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test/utils/queryWrapper";
import type { NotaCreditoRow } from "@/features/compras/services/notasCreditoGlobal";
import type { PagoProveedorRow } from "@/features/compras/services/pagosGlobal";
import ComprasNotasCredito from "../ComprasNotasCredito";
import ComprasPagos from "../ComprasPagos";

const mocks = vi.hoisted(() => ({ pagos: vi.fn(), notas: vi.fn(), descargar: vi.fn() }));
vi.mock("@/hooks/shared/useOrgFilter", () => ({ useOrgFilter: () => ({ organizationId: "org-test", orgListo: true }) }));
vi.mock("@/features/compras/services/pagosGlobal", () => ({ listarPagosProveedorGlobal: mocks.pagos }));
vi.mock("@/features/compras/services/notasCreditoGlobal", () => ({ listarNotasCreditoGlobal: mocks.notas }));
vi.mock("@/lib/downloadBlob", () => ({ descargarBlob: mocks.descargar }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));

const factura = {
  proveedor_factura_id: "factura-1", factura_folio_interno: "FP-1", factura_folio_proveedor: null,
  proveedor_id: "proveedor-1", proveedor_nombre: "Proveedor demo",
};

const pago: PagoProveedorRow = {
  ...factura, id: "pago-1", fecha_pago: "2026-10-20", monto: 50, moneda: "MXN", tipo_cambio_usd: null,
  metodo_pago: "Transferencia", es_ajuste: false, referencia: "REF-1", cuenta_bancaria_id: null, factura_total: 100,
};

const nota: NotaCreditoRow = {
  ...factura, id: "nota-1", fecha: "2026-10-20", monto: 20, moneda: "MXN", folio_nc: "NC-1", motivo: "Descuento",
  estado: "Aplicada", tipo_cambio: null, factura_moneda: "MXN", factura_tipo_cambio: null,
  monto_en_moneda_factura: 20, descripcion: null,
};

describe("Filtro Desde/Hasta de Compras", () => {
  it.each([
    { nombre: "Pagos", Page: ComprasPagos, fetch: mocks.pagos, row: pago },
    { nombre: "Notas de crédito", Page: ComprasNotasCredito, fetch: mocks.notas, row: nota },
  ])("$nombre bloquea consulta y CSV hasta corregir el rango", async ({ Page, fetch, row }) => {
    vi.clearAllMocks();
    fetch.mockResolvedValue([row]);
    render(
      <MemoryRouter>
        <NuqsTestingAdapter hasMemory searchParams="?desde=2026-10-20&hasta=2026-10-10">
          <Page />
        </NuqsTestingAdapter>
      </MemoryRouter>,
      { wrapper: createWrapper() },
    );

    const hasta = screen.getByRole("textbox", { name: "Hasta" });
    const exportar = screen.getByRole("button", { name: "Exportar CSV" });
    expect(screen.getByRole("textbox", { name: "Desde" })).toHaveValue("20/10/2026");
    expect(hasta).toHaveValue("10/10/2026");
    expect(hasta).toHaveAccessibleDescription("La fecha Desde no puede ser posterior a Hasta.");
    expect(hasta).toHaveAttribute("aria-invalid", "true");
    expect(exportar).toBeDisabled();
    fireEvent.click(exportar);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.descargar).not.toHaveBeenCalled();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    fireEvent.change(hasta, { target: { value: "20/10/2026" } });
    fireEvent.blur(hasta);

    expect(await screen.findByText("Proveedor demo")).toBeInTheDocument();
    expect(hasta).not.toHaveAttribute("aria-invalid");
    expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ desde: "2026-10-20", hasta: "2026-10-20" }), "org-test");
    expect(exportar).toBeEnabled();
    fireEvent.click(exportar);
    expect(mocks.descargar).toHaveBeenCalledOnce();
  });
});

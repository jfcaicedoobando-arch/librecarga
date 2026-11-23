import { fireEvent, render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { CarteraPendienteRow } from "../../types/bandejas";
import Cartera from "../Cartera";

const estado = vi.hoisted(() => ({ canRegistrarCobro: true }));
vi.mock("@/hooks/shared/usePermissions", () => ({ usePermissions: () => estado }));
vi.mock("@/hooks/shared", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/hooks/shared")>(),
  useIsMobile: () => true,
}));
vi.mock("@/features/bandejas/hooks/useBandejas", () => ({
  useCarteraPendiente: () => ({ data: { rows }, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/features/catalogos/hooks", () => ({ useExchangeRates: () => ({ data: undefined }) }));
vi.mock("@/features/cobranza/components/DialogRecordatorioCobranza", () => ({ DialogRecordatorioCobranza: () => null }));
vi.mock("@/features/facturacion/components/DialogCobroLoteCliente", () => ({
  DialogCobroLoteCliente: ({ open }: { open: boolean }) => open ? <div role="dialog">Confirmar lote de prueba</div> : null,
}));

function factura(id: string, props: Partial<CarteraPendienteRow> = {}): CarteraPendienteRow {
  return {
    factura_id: id, numero: `F-${id}`, cliente_id: "cliente", cliente_nombre: "Cliente QA",
    embarque_id: null, expediente: null, fecha_emision: null, fecha_vencimiento: "2026-10-01", dias_vencido: 4,
    moneda: "MXN", total: 100, pagado: 0, saldo: 100, ultimo_contacto: null, estado: "Vigente",
    ...props,
  };
}
const rows = [factura("1"), factura("2"), factura("3", { cancellation_status: "pending" }),
  factura("4", { metodo_pago: "PUE", pagado: 1 })];

function montar() {
  render(
    <MemoryRouter initialEntries={["/cartera"]}>
      <NuqsTestingAdapter>
        <Routes>
          <Route path="/cartera" element={<Cartera />} />
          <Route path="/facturacion/:id" element={<p>Detalle fiscal</p>} />
        </Routes>
      </NuqsTestingAdapter>
    </MemoryRouter>,
  );
}

describe("Cobranza en pantallas pequeñas", () => {
  it("permite preparar, desmarcar y limpiar un lote sin abrir el detalle por accidente", () => {
    estado.canRegistrarCobro = true;
    montar();
    const f1 = screen.getByRole("checkbox", { name: "Seleccionar factura F-1" });
    const f2 = screen.getByRole("checkbox", { name: "Seleccionar factura F-2" });
    expect(screen.getByRole("checkbox", { name: "Seleccionar factura F-3" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Seleccionar factura F-4" })).toBeDisabled();
    fireEvent.click(f1);
    expect(f1).toBeChecked();
    expect(screen.getByRole("button", { name: "Cobro en lote" })).toBeDisabled();
    fireEvent.click(f2);
    const lote = screen.getByRole("button", { name: "Cobro en lote" });
    expect(lote).toBeEnabled();
    fireEvent.click(f2);
    expect(f2).not.toBeChecked();
    expect(lote).toBeDisabled();
    fireEvent.click(f2);
    fireEvent.click(lote);
    expect(screen.getByRole("dialog")).toHaveTextContent("Confirmar lote de prueba");
    fireEvent.click(screen.getByRole("button", { name: "Limpiar selección" }));
    expect(f1).not.toBeChecked();
    expect(f2).not.toBeChecked();
    expect(screen.queryByText("Detalle fiscal")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Ver factura F-1" }));
    expect(screen.getByText("Detalle fiscal")).toBeVisible();
  });

  it("mantiene la navegación y oculta la selección para roles de lectura", () => {
    estado.canRegistrarCobro = false;
    montar();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver factura F-1" })).toBeVisible();
  });
});

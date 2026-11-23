import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { BandejaRepPendientes } from "../BandejaRepPendientes";

const { fetchPage, timbrar } = vi.hoisted(() => ({ fetchPage: vi.fn(), timbrar: vi.fn() }));
vi.mock("@/lib/contexts/OrganizationContext", () => ({
  useOrganization: () => ({ organizationId: "org-a", loading: false }),
}));
vi.mock("@/features/facturacion/services/bandejas", () => ({
  fetchPagosRepPendientes: fetchPage,
  REP_PENDIENTES_SORT_KEYS: ["factura", "cliente", "fecha_pago", "monto", "estado"],
}));
vi.mock("@/features/facturacion/hooks/useTimbrarRepsLote", () => ({
  useTimbrarRepsLote: () => ({ timbrar, enProceso: false, progreso: null }),
}));

beforeEach(() => {
  fetchPage.mockReset();
  timbrar.mockReset().mockResolvedValue({});
});

function paginaRep(id: number, count = 620) {
  return {
    count,
    rows: [{
      id: `rep-${id}`, factura_id: `factura-${id}`, factura_numero: `F-${id}`,
      cliente_nombre: "Cliente", fecha_pago: "2026-10-13", monto: 100, moneda: "MXN", estado_rep: "Pendiente",
    }],
  };
}

function renderBandeja() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <NuqsTestingAdapter hasMemory>
        <MemoryRouter><BandejaRepPendientes /></MemoryRouter>
      </NuqsTestingAdapter>
    </QueryClientProvider>,
  );
}

it("confirma los pagos de otras páginas sin perderlos al cancelar ni duplicar el timbrado", async () => {
  fetchPage.mockImplementation((_org: string, { range }: { range: { from: number } }) =>
    Promise.resolve(paginaRep(range.from)),
  );
  let completar = () => {};
  timbrar.mockImplementation(() => new Promise<void>((resolve) => { completar = resolve; }));
  renderBandeja();

  await waitFor(() => expect(screen.getByText(/de 620 complementos pendientes/)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar fila" }));
  fireEvent.click(screen.getByRole("button", { name: "Última página" }));
  await waitFor(() => expect(fetchPage).toHaveBeenCalledWith("org-a", expect.objectContaining({
    range: { from: 600, to: 699 },
  })));
  expect(await screen.findByRole("button", { name: "Timbrar REP de la factura F-600" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar fila" }));
  expect(screen.getByText(/fuera de esta página/).closest("p")).toHaveTextContent("2 pagos seleccionados · 1 fuera de esta página");
  fireEvent.click(screen.getByRole("button", { name: "Timbrar REP seleccionados" }));
  const dialog = screen.getByRole("alertdialog", { name: "Confirmar timbrado de REP" });
  expect(dialog).toHaveTextContent("El lote contiene 2 REP. 1 fuera de esta página.");
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  expect(timbrar).not.toHaveBeenCalled();
  expect(screen.getByRole("checkbox", { name: "Seleccionar fila" })).toBeChecked();

  fireEvent.click(screen.getByRole("button", { name: "Timbrar REP seleccionados" }));
  const confirmar = screen.getByRole("button", { name: "Timbrar lote" });
  fireEvent.click(confirmar);
  fireEvent.click(confirmar);
  expect(timbrar).toHaveBeenCalledWith(["rep-0", "rep-600"]);
  expect(timbrar).toHaveBeenCalledTimes(1);
  await act(async () => completar());
  expect(screen.queryByRole("button", { name: "Timbrar REP seleccionados" })).not.toBeInTheDocument();
});

it("requiere confirmar una selección que queda oculta tras buscar y timbra directo si todas las filas están visibles", async () => {
  fetchPage.mockImplementation((_org: string, { search }: { search: string }) =>
    Promise.resolve(paginaRep(search ? 200 : 0, 1)),
  );
  renderBandeja();

  await screen.findByRole("button", { name: "Timbrar REP de la factura F-0" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar fila" }));
  fireEvent.change(screen.getByPlaceholderText("Buscar factura o cliente…"), { target: { value: "F-200" } });
  expect(screen.getByRole("button", { name: "Timbrar REP seleccionados" })).toBeDisabled();
  await screen.findByRole("button", { name: "Timbrar REP de la factura F-200" });
  fireEvent.click(screen.getByRole("button", { name: "Timbrar REP seleccionados" }));
  const dialog = screen.getByRole("alertdialog", { name: "Confirmar timbrado de REP" });
  expect(dialog).toHaveTextContent("El lote contiene 1 REP. 1 fuera de esta página.");
  expect(timbrar).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
  fireEvent.click(screen.getByRole("button", { name: "Limpiar selección" }));

  fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar fila" }));
  expect(screen.queryByText(/fuera de esta página/)).not.toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Timbrar REP seleccionados" })); });
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(timbrar).toHaveBeenCalledExactlyOnceWith(["rep-200"]);
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NuqsAdapter } from "nuqs/adapters/react-router/v8";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ejecutarPagoProgramado } from "@/features/tesoreria/services/ejecutarPagoProgramado";
import type { FacturaProgramableRow } from "@/features/tesoreria/services/pagosProgramados";
import TesoreriaPagosProgramados from "../TesoreriaPagosProgramados";

const factura: FacturaProgramableRow = {
  id: "f1", proveedor_nombre: "Naviera de prueba", folio_proveedor: "FP1",
  fecha_emision: "2020-08-10", fecha_vencimiento: "2020-08-20", fecha_programada_pago: "2020-08-18",
  moneda: "USD", tipo_cambio_usd: 19.5, total: 50, saldo: 16, estado: "Vigente", estado_aprobacion: "aprobada",
};

vi.mock("@/features/tesoreria/services/pagosProgramados", () => ({
  fetchPagosProgramables: async () => [factura],
}));
vi.mock("@/features/tesoreria/services/ejecutarPagoProgramado", () => ({ ejecutarPagoProgramado: vi.fn() }));
vi.mock("@/features/tesoreria/hooks/useTesoreriaCuentas", () => ({
  useCuentasBancarias: () => ({ data: [], isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

const titulo = "Registrar pago realizado";
const advertencia = "¿Descartar los cambios?";
const referencia = "Transferencia de prueba";

async function abrirDialogo() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <NuqsAdapter>
          <TooltipProvider><TesoreriaPagosProgramados /></TooltipProvider>
        </NuqsAdapter>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Registrar pago" }));
  // Radix activa la escucha de clic exterior en el siguiente turno.
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

const pedirCierre = {
  Cancelar: () => fireEvent.click(screen.getByRole("button", { name: "Cancelar" })),
  X: () => fireEvent.click(screen.getByRole("button", { name: "Cerrar" })),
  Escape: () => fireEvent.keyDown(screen.getByLabelText("Referencia"), { key: "Escape" }),
  exterior: () => {
    const fondo = screen.getByRole("dialog", { name: titulo }).previousElementSibling!;
    fireEvent.pointerDown(fondo, { button: 0 });
    fireEvent.click(fondo);
  },
};

describe("Registro de pago programado", () => {
  beforeEach(() => vi.mocked(ejecutarPagoProgramado).mockReset());

  it("toma saldo y tipo de cambio de la factura como valores iniciales y cierra si se restauran", async () => {
    await abrirDialogo();
    const monto = screen.getByLabelText("Monto *");
    expect(monto).toHaveValue("16");
    expect(screen.getByLabelText("Tipo de cambio (MXN por USD) *")).toHaveValue("19.5");
    fireEvent.change(monto, { target: { value: "14" } });
    fireEvent.change(monto, { target: { value: "16" } });
    pedirCierre.Cancelar();
    expect(screen.queryByRole("dialog", { name: titulo })).not.toBeInTheDocument();
    expect(screen.queryByText(advertencia)).not.toBeInTheDocument();
  });

  it.each(Object.entries(pedirCierre))("protege la referencia al intentar cerrar por %s", async (_via, cerrar) => {
    await abrirDialogo();
    const campo = screen.getByLabelText("Referencia");
    act(() => campo.focus());
    fireEvent.change(campo, { target: { value: referencia } });
    cerrar();

    const alerta = screen.getByRole("alertdialog", { name: advertencia });
    fireEvent.click(within(alerta).getByRole("button", { name: "Seguir capturando" }));
    expect(screen.getByLabelText("Referencia")).toHaveValue(referencia);
    pedirCierre.Cancelar();
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(screen.queryByRole("dialog", { name: titulo })).not.toBeInTheDocument();
    expect(ejecutarPagoProgramado).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Registrar pago" }));
    expect(screen.getByLabelText("Referencia")).toHaveValue("");
  });

  it("bloquea cierres y envíos duplicados, conserva el intento fallido y cierra al guardar", async () => {
    const ejecutar = vi.mocked(ejecutarPagoProgramado);
    let fallarIntento: (error: Error) => void = () => {};
    ejecutar.mockImplementationOnce(() => new Promise((_resolve, reject) => { fallarIntento = reject; }));
    ejecutar.mockResolvedValueOnce({ pago_id: "p1", movimiento_id: null, saldo_cuenta_restante: null });
    await abrirDialogo();
    fireEvent.keyDown(screen.getByLabelText("Medio de pago"), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Efectivo" }));
    const campo = screen.getByLabelText("Referencia");
    fireEvent.change(campo, { target: { value: referencia } });
    const form = campo.closest("form")!;

    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(screen.getByRole("dialog", { name: titulo })).toHaveAttribute("aria-busy", "true"));
    for (const cerrar of Object.values(pedirCierre)) cerrar();
    expect(screen.queryByText(advertencia)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Referencia")).toHaveValue(referencia);
    expect(ejecutar).toHaveBeenCalledOnce();

    fallarIntento(new Error("Respuesta fallida de prueba"));
    await waitFor(() => expect(screen.getByRole("dialog", { name: titulo })).toHaveAttribute("aria-busy", "false"));
    expect(screen.getByLabelText("Referencia")).toHaveValue(referencia);
    fireEvent.submit(form);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: titulo })).not.toBeInTheDocument());
    expect(ejecutar).toHaveBeenCalledTimes(2);
    expect(ejecutar.mock.calls[0][0].requestId).toBeTruthy();
    expect(ejecutar.mock.calls[1][0].requestId).toBe(ejecutar.mock.calls[0][0].requestId);
  });
});

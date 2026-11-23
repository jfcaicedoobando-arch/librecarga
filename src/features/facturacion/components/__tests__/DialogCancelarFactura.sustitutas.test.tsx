import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { facturacion } from "@/features/facturacion/queryKeys";
import { DialogCancelarFactura } from "../DialogCancelarFactura";

const { listarSustitutas, cancelar } = vi.hoisted(() => ({
  listarSustitutas: vi.fn(),
  cancelar: vi.fn(),
}));
vi.mock("@/features/facturacion/services/sustitutasDeFactura", () => ({ listarSustitutas }));
vi.mock("@/features/facturacion/hooks/useTimbrarFactura", () => ({
  useCancelarFactura: () => ({ mutate: cancelar, isPending: false, isError: false }),
}));
vi.mock("../detalle/DialogConsultarFacturapi", () => ({ DialogConsultarFacturapi: () => null }));

describe("consulta de sustitutas para el motivo SAT 01", () => {
  it("muestra el fallo de consulta, recupera con reintento y bloquea la selección anterior ante un nuevo fallo", async () => {
    listarSustitutas
      .mockRejectedValueOnce(new Error("Error de lectura"))
      .mockResolvedValueOnce([{ id: "sustituta", estado: "Emitida", uuid_fiscal: "b9a30343", numero: "F-002" }])
      .mockRejectedValueOnce(new Error("Error al actualizar"));
    const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={cliente}>
        <DialogCancelarFactura facturaId="original" open onOpenChange={vi.fn()} onAbrirSustituir={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: /^01 - / }));
    const confirmar = screen.getByRole("button", { name: "Confirmar cancelación" });

    expect(await screen.findByText("No pudimos cargar las sustitutas")).toBeVisible();
    expect(screen.queryByText("No hay sustituta timbrada")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Abrir asistente/ })).not.toBeInTheDocument();
    expect(confirmar).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(confirmar).toBeEnabled());
    expect(screen.getByText(/F-002/)).toBeVisible();

    await act(async () => {
      await cliente.invalidateQueries({ queryKey: facturacion.sustitutasDe("original") });
    });
    expect(await screen.findByText("No pudimos cargar las sustitutas")).toBeVisible();
    expect(confirmar).toBeDisabled();
    expect(cancelar).not.toHaveBeenCalled();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RespuestaClienteManualDialog } from "../RespuestaClienteManualDialog";

const { actualizar } = vi.hoisted(() => ({ actualizar: vi.fn() }));
vi.mock("@/hooks/shared", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/features/proformas/services/respuestaCliente", () => ({ actualizarEstadoClienteProforma: actualizar }));

describe("Respuesta manual de proforma", () => {
  it("describe el rechazo, enfoca su motivo vacío y no envía el formulario", () => {
    render(<QueryClientProvider client={new QueryClient()}>
      <RespuestaClienteManualDialog open onOpenChange={vi.fn()} proformaId="pr" numero="PR-010" modo="rechazada" />
    </QueryClientProvider>);
    expect(screen.getByRole("dialog")).toHaveAccessibleDescription(/cliente rechazó la proforma PR-010/);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    const motivo = screen.getByRole("textbox", { name: "Motivo de rechazo *" });
    expect(motivo).toHaveFocus();
    expect(motivo).toHaveAccessibleDescription("Indica el motivo de rechazo.");
    expect(actualizar).not.toHaveBeenCalled();
    fireEvent.change(motivo, { target: { value: "Revisar flete" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("protege el motivo de un rechazo en curso y lo conserva si falla", async () => {
    const onOpenChange = vi.fn();
    let rechazar!: (error: Error) => void;
    const promise = new Promise<void>((_resolve, reject) => { rechazar = reject; });
    actualizar.mockReturnValueOnce(promise);
    render(<QueryClientProvider client={new QueryClient()}>
      <RespuestaClienteManualDialog open onOpenChange={onOpenChange} proformaId="pr" numero="PR-010" modo="rechazada" />
    </QueryClientProvider>);
    const dialog = screen.getByRole("dialog");
    const motivo = screen.getByRole("textbox", { name: "Motivo de rechazo *" });
    fireEvent.change(motivo, { target: { value: "Revisar flete" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
    expect(dialog).toHaveAttribute("aria-busy", "true");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    await act(async () => rechazar(new Error("fallo simulado")));
    expect(dialog).toHaveAttribute("aria-busy", "false");
    expect(motivo).toHaveValue("Revisar flete");
  });
});

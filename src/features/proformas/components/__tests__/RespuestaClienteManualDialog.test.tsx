import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
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
});

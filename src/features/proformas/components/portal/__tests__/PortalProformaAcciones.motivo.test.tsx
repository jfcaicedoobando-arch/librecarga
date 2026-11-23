import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { COPY_VALIDACION } from "@/lib/copy/publicoCopy";
import { PortalProformaAcciones } from "../PortalProformaAcciones";

describe("Motivo del rechazo en el portal de proformas", () => {
  it("enfoca y describe el campo inválido y mantiene el envío del motivo válido", () => {
    const responder = vi.fn(async () => undefined);
    render(<PortalProformaAcciones submitting={false} error={null} onResponder={responder} />);

    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    const motivo = screen.getByRole("textbox", { name: /Motivo del rechazo/ });
    const confirmar = screen.getByRole("button", { name: "Confirmar rechazo" });
    fireEvent.change(motivo, { target: { value: " ab " } });
    fireEvent.click(confirmar);

    expect(responder).not.toHaveBeenCalled();
    expect(motivo).toHaveFocus();
    expect(motivo).toBeInvalid();
    expect(motivo).toHaveAccessibleDescription(COPY_VALIDACION.motivoRechazo);
    expect(screen.getByRole("alert")).toHaveTextContent(COPY_VALIDACION.motivoRechazo);

    fireEvent.change(motivo, { target: { value: "  Revisar conceptos  " } });
    expect(motivo).toBeValid();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(confirmar);
    expect(responder).toHaveBeenCalledExactlyOnceWith("rechazada", "Revisar conceptos");
  });
});

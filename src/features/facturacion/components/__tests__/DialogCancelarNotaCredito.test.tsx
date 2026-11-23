import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DialogCancelarNotaCredito } from "../DialogCancelarNotaCredito";

describe("Cancelar una nota de crédito", () => {
  it("valida el UUID sustituto y reinicia la captura al abrir otra nota", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    const props = { onOpenChange, onConfirm };
    const { rerender } = render(<DialogCancelarNotaCredito open folio="NC10" {...props} />);
    expect(screen.getByRole("dialog", { name: "Cancelar nota de crédito NC10" })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Motivo SAT *" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: /^01 ·/ }));
    const uuid = screen.getByRole("textbox", { name: "UUID de la NC que la sustituye *" });
    const cancelar = screen.getByRole("button", { name: "Cancelar NC" });
    expect(uuid).toHaveAccessibleDescription(/Captura el UUID/);
    fireEvent.change(uuid, { target: { value: "-".repeat(36) } });
    expect(uuid).toHaveAccessibleDescription(/formato 8-4-4-4-12/);
    expect(cancelar).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();

    const valido = "a567c591-0bc3-42ca-bf15-405570a01ff7";
    fireEvent.change(uuid, { target: { value: valido } });
    expect(cancelar).toBeEnabled();
    fireEvent.click(cancelar);
    expect(onConfirm).toHaveBeenCalledWith("01", valido);

    fireEvent.click(screen.getByText("Cerrar", { selector: "button" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(<DialogCancelarNotaCredito open={false} folio="NC10" {...props} />);
    rerender(<DialogCancelarNotaCredito open folio="NC11" {...props} />);
    expect(screen.getByRole("dialog", { name: "Cancelar nota de crédito NC11" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "UUID de la NC que la sustituye *" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Motivo SAT *" })).toHaveTextContent(/^02/);
  });
});

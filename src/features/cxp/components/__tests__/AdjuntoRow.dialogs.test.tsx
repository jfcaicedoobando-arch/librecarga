import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmRemoveDialog, ConfirmReplaceDialog } from "../AdjuntoRow.dialogs";

describe("Confirmaciones de adjuntos de proveedor", () => {
  const file = new File(["<cfdi />"], "factura-nueva.xml", { type: "application/xml" });

  it("cancela el reemplazo con Escape sin entregar el archivo", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmReplaceDialog file={file} tipo="XML" onCancel={onCancel} onConfirm={onConfirm} />);

    const dialog = screen.getByRole("alertdialog", { name: /reemplazar el xml/i });
    expect(dialog).toHaveAccessibleDescription(/factura-nueva\.xml/);
    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("entrega una vez el archivo elegido al confirmar el reemplazo", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmReplaceDialog file={file} tipo="XML" onCancel={onCancel} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Reemplazar" }));

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(file);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancela o confirma la eliminación del adjunto según la acción elegida", () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmRemoveDialog open tipo="PDF" onOpenChange={onOpenChange} onConfirm={onConfirm} />);

    expect(screen.getByRole("alertdialog", { name: /quitar el pdf/i })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

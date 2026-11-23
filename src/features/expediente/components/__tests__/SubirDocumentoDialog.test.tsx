import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SubirDocumentoDialog } from "../SubirDocumentoDialog";

function props() {
  return {
    open: true,
    descripcion: "Adjunta un archivo para el expediente de prueba.",
    onOpenChange: vi.fn(),
    onGuardar: vi.fn(),
    isPending: false,
    tipos: ["Otro"],
    tiposConVencimiento: [] as string[],
  };
}

it("pide confirmación al cancelar con notas y conserva la captura al continuar", () => {
  const fixture = props();
  render(<SubirDocumentoDialog {...fixture} />);
  const notas = screen.getByLabelText(/Notas/);
  fireEvent.change(notas, { target: { value: "Conservar captura" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

  expect(fixture.onOpenChange).not.toHaveBeenCalled();
  expect(screen.getByRole("alertdialog")).toHaveTextContent("¿Descartar los cambios?");
  fireEvent.click(screen.getByRole("button", { name: "Seguir capturando" }));
  expect(notas).toHaveValue("Conservar captura");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
  expect(fixture.onOpenChange).toHaveBeenCalledWith(false);
});

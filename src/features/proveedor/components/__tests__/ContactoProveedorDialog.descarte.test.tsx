import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ContactoProveedorDialog } from "../ContactoProveedorDialog";

it("protege el borrador al cancelar y confirma antes de cerrarlo", () => {
  const onOpenChange = vi.fn();
  render(<ContactoProveedorDialog open contacto={null} isPending={false}
    onOpenChange={onOpenChange} onGuardar={vi.fn()} />);

  fireEvent.change(screen.getByRole("textbox", { name: /Nombre/ }), { target: { value: "Contacto ficticio" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(screen.getByText("¿Descartar los cambios?")).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
  expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
});

it("bloquea el cierre durante el guardado", () => {
  const onOpenChange = vi.fn();
  render(<ContactoProveedorDialog open contacto={null} isPending
    onOpenChange={onOpenChange} onGuardar={vi.fn()} />);

  expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onOpenChange).not.toHaveBeenCalled();
});

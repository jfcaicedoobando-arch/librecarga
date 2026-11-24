import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DialogSeguroForm } from "../DialogSeguroForm";

const mocks = vi.hoisted(() => ({ crear: vi.fn(), pendiente: false }));
vi.mock("@/features/embarques/hooks/useSegurosEmbarque", () => ({
  useCreateSeguro: () => ({ mutateAsync: mocks.crear, isPending: mocks.pendiente }),
  useUpdateSeguro: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("../SeguroFacturaProveedorSelect", () => ({ SeguroFacturaProveedorSelect: () => null }));

beforeEach(() => { mocks.pendiente = false; });

it("protege la captura con Cancelar y Escape, y bloquea el cierre durante el envío", () => {
  const close = vi.fn();
  const { rerender } = render(<DialogSeguroForm open onOpenChange={close} embarqueId="fixture" />);
  const aseguradora = screen.getByRole("textbox", { name: /Aseguradora/ });
  fireEvent.change(aseguradora, { target: { value: "Aseguradora de prueba" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Seguir capturando" }));
  expect(aseguradora).toHaveValue("Aseguradora de prueba");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Seguir capturando" }));
  mocks.pendiente = true;
  rerender(<DialogSeguroForm open onOpenChange={close} embarqueId="fixture" />);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  expect(close).not.toHaveBeenCalled();
});

it("enfoca y explica la suma inválida sin registrar una póliza", () => {
  render(<DialogSeguroForm open onOpenChange={vi.fn()} embarqueId="fixture" />);
  fireEvent.change(screen.getByRole("textbox", { name: /Aseguradora/ }), { target: { value: "Aseguradora de prueba" } });
  fireEvent.change(screen.getByRole("textbox", { name: /Número de póliza/ }), { target: { value: "POL-QA" } });
  fireEvent.click(screen.getByRole("button", { name: "Registrar póliza" }));
  const suma = screen.getByRole("spinbutton", { name: "Suma asegurada" });
  expect(suma).toHaveFocus();
  expect(suma).toHaveAttribute("aria-invalid", "true");
  expect(suma).toHaveAccessibleDescription("Captura una suma asegurada mayor a cero.");
  expect(mocks.crear).not.toHaveBeenCalled();
  fireEvent.change(suma, { target: { value: "50" } });
  expect(suma).not.toHaveAttribute("aria-invalid");
});

it("anuncia los campos obligatorios, incluida la vigencia", () => {
  render(<DialogSeguroForm open onOpenChange={vi.fn()} embarqueId="fixture" />);
  for (const nombre of [/Aseguradora/, /Número de póliza/, /Vigencia desde/, /Vigencia hasta/, /Prima/]) {
    expect(screen.getByLabelText(nombre)).toHaveAttribute("aria-required", "true");
  }
  expect(screen.getByLabelText("Cobertura")).not.toHaveAttribute("aria-required");
});

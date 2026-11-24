import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import AltaProspectoDialog from "../AltaProspectoDialog";

const registrar = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useBrokerPortal", () => ({
  useAltaProspectoBroker: () => ({ mutateAsync: registrar, isPending: false }),
}));

it("asocia cada requisito de alta a su control o grupo y mantiene el orden", () => {
  render(<AltaProspectoDialog brokerId="bro-qa" open nombreInicial="Empresa de prueba" onClose={vi.fn()} />);
  const pais = screen.getByRole("textbox", { name: /País/ });
  expect(pais).toHaveAccessibleDescription("Indica el país.");
  fireEvent.change(pais, { target: { value: "México" } });
  expect(screen.getByRole("group", { name: /Tipo de transporte/ })).toHaveAccessibleDescription("Elige al menos un tipo de transporte.");
  fireEvent.click(screen.getByRole("checkbox", { name: "Marítimo" }));
  const contactos = screen.getByRole("group", { name: "Contactos" });
  expect(contactos).toHaveAccessibleDescription("Agrega al menos un contacto con nombre.");
  expect(screen.getByRole("button", { name: "Registrar" })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "Nombre del contacto 1" }), { target: { value: "Ana" } });
  expect(contactos).not.toHaveAccessibleDescription();
  expect(screen.getByRole("button", { name: "Registrar" })).toBeEnabled();
  expect(registrar).not.toHaveBeenCalled();
});

it("lleva el foco al nuevo contacto y lo devuelve al anterior al quitarlo", () => {
  render(<AltaProspectoDialog brokerId="bro-qa" open nombreInicial="Empresa de prueba" onClose={vi.fn()} />);
  const primerContacto = screen.getByRole("textbox", { name: "Nombre del contacto 1" });
  fireEvent.change(primerContacto, { target: { value: "Ana" } });
  fireEvent.click(screen.getByRole("button", { name: "Agregar contacto" }));
  expect(screen.getByRole("textbox", { name: "Nombre del contacto 2" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Quitar contacto 2" }));
  expect(primerContacto).toHaveFocus();
  expect(primerContacto).toHaveValue("Ana");
});

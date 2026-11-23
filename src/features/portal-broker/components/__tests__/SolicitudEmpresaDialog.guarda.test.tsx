import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import SolicitudEmpresaDialog from "../SolicitudEmpresaDialog";

vi.mock("../../hooks/useBrokerPortal", () => ({
  useSolicitarEmpresa: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

it("Cancelar conserva la solicitud modificada hasta elegir el descarte", () => {
  const onClose = vi.fn();
  render(<MemoryRouter><SolicitudEmpresaDialog brokerId="b1"
    empresa={{ empresa_id: "e1", nombre: "Empresa de prueba" }} onClose={onClose} /></MemoryRouter>);
  const campo = screen.getByRole("textbox", { name: /nivel de confianza/ });
  fireEvent.change(campo, { target: { value: "Contacto de confianza" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.getByRole("alertdialog")).toBeVisible();
  expect(campo).toHaveValue("Contacto de confianza");
  expect(onClose).not.toHaveBeenCalled();
});

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NuevaOrganizacionDialog } from "../NuevaOrganizacionDialog";

vi.mock("@/features/admin/hooks/useNuevaOrganizacionUsuarios", () => ({
  useNuevaOrganizacionUsuarios: () => ({
    data: Array.from({ length: 75 }, (_, i) => ({ id: String(i), email: `usuario${i}@example.invalid` })),
    isLoading: false,
    isError: false,
  }),
}));

const props = {
  open: true,
  nombre: "Empresa QA",
  rfc: "",
  ownerUserId: "1",
  onOpenChange: vi.fn(),
  onNombreChange: vi.fn(),
  onRfcChange: vi.fn(),
  onOwnerUserIdChange: vi.fn(),
  onCreate: vi.fn(),
};

it("mantiene el diálogo abierto y anuncia el alta mientras se crea la organización", () => {
  render(<NuevaOrganizacionDialog {...props} isPending />);
  expect(screen.getByRole("dialog", { name: "Nueva organización" })).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Creando organización…" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  expect(props.onOpenChange).not.toHaveBeenCalled();
});

it("explica el límite del selector y busca entre todos los candidatos", () => {
  render(<NuevaOrganizacionDialog {...props} isPending={false} />);
  expect(screen.getByRole("status")).toHaveTextContent("Mostrando 50 de 75 candidatos");
  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar usuario" }), { target: { value: "usuario65" } });
  expect(screen.queryByText(/Mostrando 50 de/)).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("combobox", { name: /Administrador inicial/ }), { key: "ArrowDown" });
  expect(screen.getByRole("option", { name: "usuario65@example.invalid" })).toBeVisible();
});

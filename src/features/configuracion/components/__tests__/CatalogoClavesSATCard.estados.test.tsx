import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CatalogoClavesSATCard } from "../CatalogoClavesSATCard";

const mocks = vi.hoisted(() => ({ catalogo: vi.fn(), refetch: vi.fn() }));
vi.mock("@/features/configuracion/hooks/useCatalogoClavesSATController", () => ({
  useCatalogoClavesSATController: mocks.catalogo,
}));
vi.mock("../CatalogoClavesSATCard.parts", () => ({ EditRow: () => null }));

it("ofrece reintento cuando falla el catálogo y permite un alta tras una lectura exitosa vacía", () => {
  const base = { rows: [], addMut: {}, updateMut: {}, deleteMut: {}, refetch: mocks.refetch };
  mocks.catalogo.mockReturnValue({ ...base, isError: true });
  const { rerender } = render(<CatalogoClavesSATCard />);

  expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el catálogo de productos");
  expect(screen.getByRole("button", { name: "Nuevo producto" })).toBeDisabled();
  expect(screen.queryByText(/Aún no hay productos/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(mocks.refetch).toHaveBeenCalledOnce();

  mocks.catalogo.mockReturnValue({ ...base, isError: false });
  rerender(<CatalogoClavesSATCard />);
  expect(screen.getByText(/Aún no hay productos/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Nuevo producto" })).toBeEnabled();
});

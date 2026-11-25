import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CatalogoClavesSATCard } from "../CatalogoClavesSATCard";

const mocks = vi.hoisted(() => ({ catalogo: vi.fn(), refetch: vi.fn(), mobile: vi.fn(() => false) }));
vi.mock("@/hooks/shared/useIsMobile", () => ({ useIsMobile: mocks.mobile }));
vi.mock("@/features/configuracion/hooks/useCatalogoClavesSATController", () => ({
  useCatalogoClavesSATController: mocks.catalogo,
}));
vi.mock("@/features/configuracion/hooks/useIvaFrontera", () => ({ useIvaFronteraHabilitada: () => false }));

it("abre el alta móvil en un diálogo y conserva sus validaciones", () => {
  mocks.mobile.mockReturnValue(true);
  mocks.catalogo.mockReturnValue({ rows: [], addMut: {}, updateMut: {}, deleteMut: {} });
  render(<CatalogoClavesSATCard />);

  fireEvent.click(screen.getByRole("button", { name: "Nuevo producto" }));
  expect(screen.getByRole("dialog", { name: "Nuevo producto" })).toBeVisible();
  expect(screen.getByRole("combobox", { name: /Unidad SAT/ })).toBeVisible();
  expect(screen.getByRole("button", { name: "Guardar producto" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar edición" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  mocks.mobile.mockReturnValue(false);
});

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

it("conserva una sola edición visible al buscar y explica por qué no se puede guardar", () => {
  const rows = [
    { id: "uno", patron: "Maniobra", clave_sat: "78101800", clave_unidad_sat: "E48", tipo_iva: "gravado_16", activo: true },
    { id: "dos", patron: "Seguro", clave_sat: "84131500", clave_unidad_sat: "E48", tipo_iva: "gravado_16", activo: true },
  ];
  mocks.catalogo.mockReturnValue({ rows, addMut: {}, updateMut: {}, deleteMut: {} });
  render(<CatalogoClavesSATCard />);
  const buscar = screen.getByRole("searchbox", { name: /Buscar por nombre o clave SAT/i });
  fireEvent.change(buscar, { target: { value: "84131500" } });
  expect(screen.getByText("Seguro")).toBeInTheDocument();
  expect(screen.queryByText("Maniobra")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
  fireEvent.click(screen.getByRole("button", { name: "Editar producto Maniobra" }));
  expect(screen.getByRole("button", { name: "Nuevo producto" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Editar producto Seguro" })).toBeDisabled();
  fireEvent.change(buscar, { target: { value: "otra cosa" } });
  expect(screen.getByRole("textbox", { name: "Patrón de descripción" })).toHaveValue("Maniobra");
  fireEvent.change(screen.getByRole("textbox", { name: "Clave SAT" }), { target: { value: "12" } });
  const guardar = screen.getByRole("button", { name: "Guardar producto" });
  expect(guardar).toBeDisabled();
  expect(guardar).toHaveAccessibleDescription("Completa la clave SAT con al menos 6 caracteres.");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar edición" }));
  expect(screen.getByRole("button", { name: "Nuevo producto" })).toBeEnabled();
});

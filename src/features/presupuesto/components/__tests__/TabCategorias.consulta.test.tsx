import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TabCategorias } from "../TabCategorias";

const { useCategorias, seed } = vi.hoisted(() => ({ useCategorias: vi.fn(), seed: vi.fn() }));
vi.mock("@/features/presupuesto/hooks", () => ({
  usePresupuestoCategorias: useCategorias,
  useEliminarCategoriaPresupuesto: () => ({}),
  useCrearCategoriaPresupuesto: () => ({}),
  useActualizarCategoriaPresupuesto: () => ({}),
}));
vi.mock("@/features/presupuesto/services", () => ({ seedCategoriasDefault: seed }));
vi.mock("@/lib/contexts/OrganizationContext", () => ({ useOrganization: () => ({ organizationId: "org-qa" }) }));

describe("configuración de categorías presupuestales", () => {
  it("ofrece categorías por defecto sólo después de una respuesta vacía confirmada", () => {
    const refetch = vi.fn();
    const crear = { name: "Crear 6 categorías por defecto" };
    useCategorias.mockReturnValue({ isSuccess: false, isError: false, isFetching: true, refetch });
    const { rerender } = render(<TabCategorias />);
    expect(screen.queryByRole("button", crear)).not.toBeInTheDocument();

    useCategorias.mockReturnValue({ isSuccess: false, isError: true, isFetching: false, refetch });
    rerender(<TabCategorias />);
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar las categorías");
    expect(screen.queryByRole("button", crear)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();

    useCategorias.mockReturnValue({ isSuccess: true, isError: false, isFetching: false, data: [], refetch });
    rerender(<TabCategorias />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", crear)).toBeEnabled();
    expect(seed).not.toHaveBeenCalled();
  });
});

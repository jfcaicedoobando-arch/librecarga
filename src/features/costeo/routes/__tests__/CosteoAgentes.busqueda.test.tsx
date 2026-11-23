import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import CosteoAgentes from "../CosteoAgentes";

const { cargarAgentes } = vi.hoisted(() => ({ cargarAgentes: vi.fn() }));
vi.mock("@/features/costeo/hooks/useCosteoAgentes", () => ({
  useCosteoAgentes: cargarAgentes,
  useCosteoAgenteMutations: () => ({ crear: {}, actualizar: {}, eliminar: {} }),
}));
vi.mock("@/features/costeo/hooks/useNavieraCondiciones", () => ({ useProveedoresAgente: () => ({ data: [] }) }));
vi.mock("@/features/costeo/components/CosteoAgenteFormDialog", () => ({ CosteoAgenteFormDialog: () => null }));
vi.mock("@/features/costeo/components/InvitarAgentePortalDialog", () => ({ InvitarAgentePortalDialog: () => null }));

describe("búsqueda de agentes de costeo", () => {
  const vista = () => <MemoryRouter><CosteoAgentes /></MemoryRouter>;

  it("distingue los filtros sin coincidencias y recupera la lista al limpiar", () => {
    cargarAgentes.mockReturnValue({ data: [{ id: "agent-1", nombre: "Agente Uno", activo: true }] });
    render(vista());
    const busqueda = screen.getByPlaceholderText("Buscar por nombre, país, contacto o email…");
    expect(screen.getByText("Agente Uno", { exact: true })).toBeVisible();
    fireEvent.change(busqueda, { target: { value: "inexistente" } });
    expect(screen.getByText("No hay agentes que coincidan con la búsqueda.")).toBeVisible();
    expect(screen.queryByText("Sin agentes registrados.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    expect(busqueda).toHaveValue("");
    expect(screen.getByText("Agente Uno", { exact: true })).toBeVisible();
  });

  it("conserva el estado de directorio vacío cuando todavía no hay agentes", () => {
    cargarAgentes.mockReturnValue({ data: [] });
    render(vista());
    expect(screen.getByText("Sin agentes registrados.")).toBeVisible();
  });
});

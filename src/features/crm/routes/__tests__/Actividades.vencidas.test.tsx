import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { MemoryRouter } from "react-router";
import Actividades from "../Actividades";

const { listActividadesAgenda } = vi.hoisted(() => ({ listActividadesAgenda: vi.fn() }));

vi.mock("@/features/crm/services/actividadEntidades", () => ({ listActividadesAgenda }));
vi.mock("@/lib/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "usuario" } }) }));
vi.mock("@/hooks/shared", async (original) => ({
  ...await original<typeof import("@/hooks/shared")>(),
  useIsMobile: () => false,
  usePermissions: () => ({ canCrearActividad: false }),
}));

describe("Actividades CRM vencidas", () => {
  it("limpia en la misma acción el filtro rápido y los filtros de la tabla", async () => {
    listActividadesAgenda.mockResolvedValue({ data: [], count: 0 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NuqsTestingAdapter hasMemory searchParams="?filtro=vencidas&tipo=llamada&q=seguimiento">
          <MemoryRouter><Actividades /></MemoryRouter>
        </NuqsTestingAdapter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(listActividadesAgenda).toHaveBeenLastCalledWith(expect.objectContaining({
      tipo: "llamada", search: "seguimiento", vencidas: true,
    })));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar todo" }));
    await waitFor(() => expect(listActividadesAgenda).toHaveBeenLastCalledWith(expect.objectContaining({
      tipo: "todos", search: "", vencidas: false,
    })));
    expect(screen.queryByRole("button", { name: "Quitar filtro Vencidas" })).not.toBeInTheDocument();
  });

  it("muestra los filtros efectivos de la consulta y devuelve los filtros editables al quitar Vencidas", async () => {
    listActividadesAgenda.mockResolvedValue({ data: [], count: 0 });
    const searchParams = "?filtro=vencidas&estado=completadas&tipo=llamada&q=seguimiento";
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NuqsTestingAdapter searchParams={searchParams}>
          <MemoryRouter initialEntries={[`/crm/actividades${searchParams}`]}>
            <Actividades />
          </MemoryRouter>
        </NuqsTestingAdapter>
      </QueryClientProvider>,
    );

    const estado = screen.getByRole("combobox", { name: "Estado" });
    const responsable = screen.getByRole("combobox", { name: "Responsable" });
    expect(estado).toBeDisabled();
    expect(estado).toHaveTextContent("Pendientes");
    expect(responsable).toBeDisabled();
    expect(responsable).toHaveTextContent("Mis actividades");
    expect(screen.getByRole("combobox", { name: "Tipo" })).toBeEnabled();
    expect(screen.queryByText("Estado: completadas")).not.toBeInTheDocument();
    expect(screen.getByText("Tipo: llamada")).toBeInTheDocument();
    await waitFor(() => expect(listActividadesAgenda).toHaveBeenCalledWith(expect.objectContaining({
      estado: "pendientes", responsable: "mias", tipo: "llamada", search: "seguimiento", vencidas: true,
    })));

    fireEvent.click(screen.getByRole("button", { name: "Quitar filtro Vencidas" }));

    expect(estado).toBeEnabled();
    expect(estado).toHaveTextContent("Completadas");
    expect(responsable).toBeEnabled();
    expect(screen.getByText("Estado: completadas")).toBeInTheDocument();
    await waitFor(() => expect(listActividadesAgenda).toHaveBeenCalledWith(expect.objectContaining({
      estado: "completadas", responsable: "todos", tipo: "llamada", search: "seguimiento", vencidas: false,
    })));
  });
});

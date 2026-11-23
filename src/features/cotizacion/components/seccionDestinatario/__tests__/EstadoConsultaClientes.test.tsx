import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { EstadoConsultaClientes, type EstadoCatalogoClientes } from "../EstadoConsultaClientes";

const permisos = vi.hoisted(() => ({ canAltaCliente: false }));
vi.mock("@/hooks/shared/usePermissions", () => ({ usePermissions: () => permisos }));

it("distingue carga, error y catálogo vacío sin ampliar el permiso de alta", () => {
  const base = { isLoading: false, isError: false, isFetching: false, refetch: vi.fn() };
  const vista = (consulta: EstadoCatalogoClientes, hayClientes = false) => (
    <MemoryRouter><EstadoConsultaClientes consulta={consulta} hayClientes={hayClientes} /></MemoryRouter>
  );
  const { rerender } = render(vista({ ...base, isLoading: true }));
  expect(screen.getByRole("status")).toHaveTextContent("Cargando clientes");
  rerender(vista({ ...base, isError: true }));
  expect(screen.getByRole("alert")).toHaveTextContent("No pudimos consultar los clientes");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(base.refetch).toHaveBeenCalledOnce();
  rerender(vista(base));
  expect(screen.getByText("No hay clientes disponibles.")).toBeVisible();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  permisos.canAltaCliente = true;
  rerender(vista(base));
  expect(screen.getByRole("link", { name: "Crear cliente en otra pestaña" })).toHaveAttribute("target", "_blank");
  rerender(vista(base, true));
  expect(screen.queryByText("No hay clientes disponibles.")).not.toBeInTheDocument();
});

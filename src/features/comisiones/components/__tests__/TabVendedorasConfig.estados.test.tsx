import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TabVendedorasConfig } from "../TabVendedorasConfig";

const mocks = vi.hoisted(() => ({ consulta: vi.fn(), actualizar: vi.fn(), refetch: vi.fn() }));
vi.mock("@/lib/contexts/OrganizationContext", () => ({ useOrganization: () => ({ organizationId: "org-test" }) }));
vi.mock("@/features/comisiones/hooks", () => ({
  useVendedorasConfig: mocks.consulta,
  useUpsertVendedoraConfig: () => ({ mutate: vi.fn() }),
  useUpdateVendedoraConfig: () => ({ mutate: mocks.actualizar }),
  useEmbarquesSinVendedora: () => ({ data: [] }),
  useAsignarVendedoraEmbarque: () => ({ mutate: vi.fn() }),
}));

const vendedores = [{ id: "u1", nombre: "Lucía QA" }];

beforeEach(() => {
  mocks.actualizar.mockClear();
  mocks.refetch.mockClear();
});

it("impide guardar vacío y admite un cero explícito", () => {
  mocks.consulta.mockReturnValue({
    data: [{ id: "conf-1", user_id: "u1", porcentaje_default: 5, activa: true, fecha_alta: "2026-11-01" }],
  });
  render(<TabVendedorasConfig vendedoras={vendedores} />);
  const porcentaje = screen.getByRole("spinbutton", { name: "Porcentaje de comisión de Lucía QA" });
  const guardar = screen.getByRole("button", { name: "Guardar porcentaje de comisión de Lucía QA" });

  fireEvent.change(porcentaje, { target: { value: "" } });
  expect(porcentaje).toHaveAccessibleDescription("Ingresa un porcentaje entre 0 y 100.");
  expect(guardar).toBeDisabled();
  expect(mocks.actualizar).not.toHaveBeenCalled();

  fireEvent.change(porcentaje, { target: { value: "0" } });
  fireEvent.click(guardar);
  expect(mocks.actualizar).toHaveBeenCalledWith({ id: "conf-1", changes: { porcentaje_default: 0 } });
});

it("distingue carga y error de la falta de configuración", () => {
  const ui = <TabVendedorasConfig vendedoras={vendedores} />;
  mocks.consulta.mockReturnValue({ isLoading: true });
  const { rerender } = render(ui);
  expect(screen.getByText("Cargando porcentajes…")).toBeVisible();
  expect(screen.queryByText("Sin vendedoras configuradas.")).toBeNull();

  mocks.consulta.mockReturnValue({ isError: true, refetch: mocks.refetch });
  rerender(<TabVendedorasConfig vendedoras={vendedores} />);
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron consultar los porcentajes");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(mocks.refetch).toHaveBeenCalledOnce();
  expect(screen.queryByText("Sin vendedoras configuradas.")).toBeNull();
});

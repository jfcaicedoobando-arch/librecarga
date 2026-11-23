import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TabCierre } from "../TabCierre";

const mocks = vi.hoisted(() => ({
  consulta: vi.fn(), cerrar: vi.fn(), reintentar: vi.fn(),
}));
vi.mock("@/features/embarques/hooks/useCierreEmbarque", () => ({
  useValidacionCierre: mocks.consulta,
  useCierreLog: () => ({ data: [] }),
  useCerrarEmbarque: () => ({ mutate: mocks.cerrar }),
  useReabrirEmbarque: () => ({}),
}));
vi.mock("@/features/embarques/hooks/useSinComisionEmbarque", () => ({
  useSinComisionEmbarque: () => ({}),
}));
vi.mock("@/hooks/shared/usePermissions", () => ({
  usePermissions: () => ({ canCerrarEmbarque: true, isAdmin: true, isSuperAdmin: false }),
}));

const resultadoOk = { puede_cerrar: true, checks: [] };
const vista = () => <MemoryRouter><TabCierre embarqueId="emb-1" estatus="Entregado" /></MemoryRouter>;

describe("validación vigente para cerrar el embarque", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("distingue un error inicial, ofrece reintentar y habilita al obtener un resultado válido", () => {
    mocks.consulta.mockReturnValue({ isError: true, refetch: mocks.reintentar });
    const { rerender } = render(vista());
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo verificar el checklist de cierre");
    expect(screen.queryByText("Sin datos.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar embarque" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.reintentar).toHaveBeenCalledOnce();
    mocks.consulta.mockReturnValue({ data: resultadoOk });
    rerender(vista());
    expect(screen.getByRole("button", { name: "Cerrar embarque" })).toBeEnabled();
  });

  it("bloquea la confirmación abierta al revalidar y cuando falla con datos anteriores", () => {
    mocks.consulta.mockReturnValue({ data: resultadoOk });
    const { rerender } = render(vista());
    fireEvent.click(screen.getByRole("button", { name: "Cerrar embarque" }));
    const dialogo = within(screen.getByRole("dialog", { name: "Confirmar cierre del embarque" }));
    fireEvent.change(dialogo.getByLabelText("Confirmación"), { target: { value: "CERRAR" } });
    const confirmar = dialogo.getByRole("button", { name: "Cerrar embarque" });
    expect(confirmar).toBeEnabled();

    mocks.consulta.mockReturnValue({ data: resultadoOk, isFetching: true });
    rerender(vista());
    expect(confirmar).toBeDisabled();
    mocks.consulta.mockReturnValue({ data: resultadoOk, isError: true, refetch: mocks.reintentar });
    rerender(vista());
    expect(confirmar).toBeDisabled();
    fireEvent.click(confirmar);
    expect(mocks.cerrar).not.toHaveBeenCalled();
    fireEvent.click(dialogo.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo verificar el checklist de cierre");
    expect(screen.getByRole("button", { name: "Cerrar embarque" })).toBeDisabled();
  });
});

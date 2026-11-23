import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TabSeguridadGlobal from "../TabSeguridadGlobal";

const { query, refetch, mutate } = vi.hoisted(() => ({
  query: vi.fn(),
  refetch: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("@/features/configuracion/hooks/useConfiguracionGlobal", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/configuracion/hooks/useConfiguracionGlobal")>();
  return { ...real, useConfiguracionGlobal: query, useUpdateConfiguracionGlobal: () => ({ mutate, isPending: false }) };
});

describe("políticas globales", () => {
  it("pide reconsultar y habilita editar con los valores confirmados", () => {
    query.mockReturnValue({ isError: true, isSuccess: false, isFetching: false, refetch });
    const { rerender } = render(<TabSeguridadGlobal />);
    expect(screen.queryByRole("button", { name: /Guardar políticas/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();

    query.mockReturnValue({ isError: false, isSuccess: true, isFetching: false, refetch,
      data: [{ categoria: "seguridad", clave: "longitud_minima_password", valor: 16 }] });
    rerender(<TabSeguridadGlobal />);
    expect(screen.getByLabelText("Longitud mínima de contraseña")).toHaveValue(16);
    expect(screen.getByRole("switch", { name: "Registro público" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Guardar políticas/ }));
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([
      { categoria: "seguridad", clave: "longitud_minima_password", valor: 16 },
    ]));
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  beforeEach(() => { vi.clearAllMocks(); });

  it("pide reconsultar y habilita editar con los valores confirmados", () => {
    query.mockReturnValue({ isError: true, isSuccess: false, isFetching: false, refetch });
    const { rerender } = render(<TabSeguridadGlobal />);
    expect(screen.queryByRole("button", { name: /Guardar políticas/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();

    query.mockReturnValue({ isError: false, isSuccess: true, isFetching: false, refetch,
      data: [{ categoria: "seguridad", clave: "longitud_minima_password", valor: 16 }] });
    rerender(<TabSeguridadGlobal />);
    expect(screen.getByRole("spinbutton", { name: /Longitud mínima de contraseña/ })).toHaveValue(16);
    expect(screen.getByRole("switch", { name: "Registro público" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Guardar políticas/ }));
    expect(mutate).toHaveBeenCalledWith(expect.arrayContaining([
      { categoria: "seguridad", clave: "longitud_minima_password", valor: 16 },
    ]));
  });

  it("permite vaciar la captura y asocia a cada política el error y sus límites antes de guardar números", () => {
    query.mockReturnValue({ isError: false, isSuccess: true, isFetching: false, refetch, data: [] });
    render(<TabSeguridadGlobal />);
    const longitud = screen.getByRole("spinbutton", { name: /Longitud mínima de contraseña/ });
    const expiracion = screen.getByRole("spinbutton", { name: /Expiración de sesión/ });
    const intentos = screen.getByRole("spinbutton", { name: /Intentos máximos de login/ });
    const guardar = screen.getByRole("button", { name: /Guardar políticas/ });
    fireEvent.change(longitud, { target: { value: "" } });
    expect(longitud).toHaveValue(null);
    fireEvent.change(expiracion, { target: { value: "15.5" } });
    fireEvent.change(intentos, { target: { value: "2" } });
    fireEvent.click(guardar);

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert")).toHaveLength(3);
    expect(longitud).toHaveAttribute("aria-invalid", "true");
    expect(longitud).toHaveAccessibleDescription("Escribe un valor.");
    expect(expiracion).toHaveAccessibleDescription("Escribe un número entero entre 1 y 720.");
    expect(intentos).toHaveAccessibleDescription("Antes de bloquear temporalmente la cuenta Escribe un número entero entre 3 y 20.");

    fireEvent.change(longitud, { target: { value: "33" } });
    fireEvent.click(guardar);
    expect(longitud).toHaveAccessibleDescription("Escribe un número entero entre 6 y 32.");
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.change(longitud, { target: { value: "32" } });
    fireEvent.change(expiracion, { target: { value: "720" } });
    fireEvent.change(intentos, { target: { value: "3" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(guardar);
    expect(mutate).toHaveBeenCalledExactlyOnceWith(expect.arrayContaining([
      { categoria: "seguridad", clave: "longitud_minima_password", valor: 32 },
      { categoria: "seguridad", clave: "expiracion_sesion_horas", valor: 720 },
      { categoria: "seguridad", clave: "max_intentos_login", valor: 3 },
    ]));
  });
});

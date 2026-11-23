import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import TabCompras from "../TabCompras";

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/features/configuracion/hooks/useConfiguracion", () => ({
  useConfigValue: () => 50000,
  useUpdateConfiguracion: () => ({ mutate: mocks.mutate, isPending: false }),
}));

it("distingue un umbral vacío de cero capturado de forma explícita", () => {
  render(<TabCompras />);
  const monto = screen.getByRole("spinbutton", { name: /monto máximo sin liga/i });
  const guardar = screen.getByRole("button", { name: "Guardar monto" });

  fireEvent.change(monto, { target: { value: "" } });
  expect(monto).toHaveValue(null);
  expect(guardar).toBeDisabled();
  expect(mocks.mutate).not.toHaveBeenCalled();

  fireEvent.change(monto, { target: { value: "0" } });
  expect(guardar).toBeEnabled();
  fireEvent.click(guardar);
  expect(mocks.mutate).toHaveBeenCalledWith([
    { categoria: "compras", clave: "umbral_aprobacion_sin_vinculo", valor: 0 },
  ]);
});

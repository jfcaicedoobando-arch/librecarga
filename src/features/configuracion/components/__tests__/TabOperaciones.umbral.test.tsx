import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import TabOperaciones from "../TabOperaciones";

vi.mock("@/features/configuracion/hooks/useConfiguracion", () => ({
  useConfigValue: (_categoria: string, _clave: string, fallback: number) => fallback,
  useUpdateConfiguracion: () => ({ mutate: vi.fn(), isPending: false }),
}));

it("mantiene vacío el umbral borrado y permite escribir cero explícitamente", () => {
  render(<TabOperaciones />);
  const alerta = screen.getByRole("spinbutton", { name: /^Umbral de alerta/ });
  const guardar = screen.getByRole("button", { name: "Guardar umbrales" });
  fireEvent.change(alerta, { target: { value: "" } });
  expect(alerta).toHaveValue(null);
  expect(guardar).toBeDisabled();
  expect(alerta).toHaveAccessibleDescription(/Captura un umbral de alerta/);
  fireEvent.change(alerta, { target: { value: "0" } });
  expect(alerta).toHaveValue(0);
  expect(guardar).toBeEnabled();
});

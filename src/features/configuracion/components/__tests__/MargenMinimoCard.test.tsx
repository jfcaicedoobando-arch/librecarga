import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import MargenMinimoCard from "../MargenMinimoCard";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("@/lib/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveRole: "admin" }) }));
vi.mock("@/features/configuracion/hooks/useMargenMinimo", () => ({
  useMargenMinimo: () => 8,
  useGuardarMargenMinimo: () => ({ mutate, isPending: false }),
}));

it("deja el margen vacío sin convertirlo en cero y acepta un cero explícito", () => {
  render(<MargenMinimoCard />);
  const input = screen.getByRole("spinbutton", { name: /margen mínimo/i });
  const guardar = screen.getByRole("button", { name: "Guardar margen" });
  fireEvent.change(input, { target: { value: "" } });
  expect(input).toHaveValue(null);
  expect(input).toHaveAccessibleDescription("Ingresa un margen mínimo.");
  expect(guardar).toBeDisabled();
  fireEvent.click(guardar);
  expect(mutate).not.toHaveBeenCalled();

  fireEvent.change(input, { target: { value: "0" } });
  expect(guardar).toBeEnabled();
  fireEvent.click(guardar);
  expect(mutate).toHaveBeenCalledWith(0);
});

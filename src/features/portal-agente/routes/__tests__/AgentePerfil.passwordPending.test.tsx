import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import AgentePerfil from "../AgentePerfil";

const cambiar = vi.hoisted(() => vi.fn());
vi.mock("@/features/portal-agente/services/perfil", () => ({ actualizarPasswordAgente: cambiar }));
vi.mock("@/features/portal-agente/hooks", () => ({ useAgenteContext: () => ({ data: null }) }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

it("bloquea el campo durante la actualización y conserva la captura cuando falla", async () => {
  let rechazar!: (error: Error) => void;
  cambiar.mockReturnValue(new Promise((_, reject) => { rechazar = reject; }));
  render(<AgentePerfil />);
  const campo = screen.getByLabelText("Nueva contraseña");
  fireEvent.change(campo, { target: { value: "cambio-local-fixture" } });
  fireEvent.click(screen.getByRole("button", { name: "Actualizar contraseña" }));
  expect(campo).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Actualizando contraseña…");
  await act(async () => rechazar(new Error("Fallo simulado")));
  expect(campo).toBeEnabled();
  expect(campo).toHaveValue("cambio-local-fixture");
  expect(cambiar).toHaveBeenCalledExactlyOnceWith("cambio-local-fixture");
});

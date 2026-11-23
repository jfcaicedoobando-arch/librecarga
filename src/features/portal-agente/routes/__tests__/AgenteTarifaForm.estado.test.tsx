import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AgenteTarifaForm } from "../../components/AgenteTarifaForm";

const { contexto, rutas } = vi.hoisted(() => ({ contexto: vi.fn(), rutas: vi.fn() }));

vi.mock("@/features/portal-agente/hooks", () => ({ useAgenteContext: contexto }));
vi.mock("@/features/portal-agente/hooks/useAgenteTarifaRutas", () => ({ useAgenteTarifaRutas: rutas }));
vi.mock("@/features/costeo/components/TarifaForm", () => ({
  TarifaForm: ({ avisoRutas }: { avisoRutas: ReactNode }) => (
    <div>
      <input aria-label="Notas de la tarifa" />
      {avisoRutas}
    </div>
  ),
}));

it("ofrece recuperar la agencia y las rutas sin cerrar el flujo", () => {
  const reintentarAgencia = vi.fn();
  const reintentarRutas = vi.fn();
  contexto.mockReturnValue({ isError: true, refetch: reintentarAgencia });
  rutas.mockReturnValue({ isError: true, refetch: reintentarRutas });
  const vista = render(<AgenteTarifaForm open modo="crear" onOpenChange={vi.fn()} />);

  expect(screen.getByRole("dialog", { name: /Nueva tarifa/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(reintentarAgencia).toHaveBeenCalledOnce();

  contexto.mockReturnValue({ data: { organizationId: "org-prueba", agenteId: "agente-prueba" } });
  vista.rerender(<AgenteTarifaForm open modo="crear" onOpenChange={vi.fn()} />);
  expect(screen.getByRole("alert")).toHaveTextContent("No pudimos consultar las rutas");
  fireEvent.change(screen.getByLabelText("Notas de la tarifa"), { target: { value: "Conservar esta nota" } });
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(reintentarRutas).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Notas de la tarifa")).toHaveValue("Conservar esta nota");
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DialogGenerarLiquidacion } from "../DialogGenerarLiquidacion";
const { generar } = vi.hoisted(() => ({ generar: vi.fn() }));
vi.mock("@/lib/contexts/OrganizationContext", () => ({ useOrganization: () => ({ organizationId: "org-prueba" }) }));
vi.mock("@/features/comisiones/hooks", () => ({ useGenerarLiquidacion: () => ({ mutate: generar, isPending: false }) }));

describe("Generación de comisiones requiere identidad distinguible", () => {
  it("sin nombre no puede seleccionarse ni generar", () => {
    render(<DialogGenerarLiquidacion open onOpenChange={vi.fn()} vendedoras={[{
      id: "v1", nombre: "Nombre no capturado", email: null, identidadResuelta: false, estadoIdentidad: "sin_nombre",
    }]} />);
    expect(screen.getByRole("button", { name: "Generar" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/identidad distinguible/);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(screen.getByRole("option", { name: "Nombre no capturado" })).toHaveAttribute("aria-disabled", "true");
    expect(generar).not.toHaveBeenCalled();
  });
  it("correo autorizado identifica a una vendedora aunque full_name sea null", () => {
    render(<DialogGenerarLiquidacion open onOpenChange={vi.fn()} vendedoras={[{
      id: "v1", nombre: "vendedora@example.test", email: "vendedora@example.test", identidadResuelta: true, estadoIdentidad: "resuelta",
    }]} />);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "vendedora@example.test" }));
    const periodo = screen.getByRole("textbox", { name: "Periodo" });
    fireEvent.change(periodo, { target: { value: "01/2025" } });
    fireEvent.blur(periodo);
    expect(screen.getByRole("button", { name: "Generar" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Generar" }));
    expect(generar).toHaveBeenCalledWith({ vendedora_id: "v1", periodo: "2025-01", organization_id: "org-prueba" }, expect.anything());
  });
});

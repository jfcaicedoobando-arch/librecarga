import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Onboarding from "../Onboarding";

const fixture = vi.hoisted(() => ({
  organizationId: "empresa-qa" as string | null,
  completar: vi.fn(),
  actualizar: vi.fn(async () => {}),
}));
vi.mock("@/lib/contexts/AuthContext", () => ({ useAuth: () => ({
  user: { id: "usuario-qa" }, organization: { nombre: "Agencia de prueba" },
  loading: false, refreshProfile: fixture.actualizar,
}) }));
vi.mock("@/hooks/shared/useOrgActiva", () => ({ useOrgActiva: () => ({ organizationId: fixture.organizationId }) }));
vi.mock("@/features/onboarding/services/completeOnboarding", () => ({ completeOnboarding: fixture.completar }));

beforeEach(() => {
  fixture.organizationId = "empresa-qa";
  vi.clearAllMocks();
});

describe("Configuración inicial", () => {
  it("conserva la captura cuando se cancela la opción de omitir", () => {
    render(<MemoryRouter><Onboarding /></MemoryRouter>);
    const rfc = screen.getByRole("textbox", { name: "RFC de la organización" });
    fireEvent.change(rfc, { target: { value: "ABC010203XY4" } });
    fireEvent.click(screen.getByRole("button", { name: "Configurar después" }));
    expect(screen.getByRole("alertdialog", { name: "¿Continuar sin datos fiscales?" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Conservar captura" }));
    expect(rfc).toHaveValue("ABC010203XY4");
    expect(fixture.completar).not.toHaveBeenCalled();
  });

  it("enfoca y describe el RFC inválido antes de guardar", () => {
    render(<MemoryRouter><Onboarding /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));
    const rfc = screen.getByRole("textbox", { name: "RFC de la organización" });
    expect(rfc).toHaveFocus();
    expect(rfc).toHaveAccessibleDescription(/Captura el RFC de la organización o pulsa Configurar después/);
    expect(fixture.completar).not.toHaveBeenCalled();
  });

  it("ofrece reintentar el acceso antes de capturar si falta la organización", async () => {
    fixture.organizationId = null;
    render(<MemoryRouter><Onboarding /></MemoryRouter>);
    expect(screen.queryByRole("textbox", { name: "RFC de la organización" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar acceso" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reintentar acceso" })).toBeEnabled());
    expect(fixture.actualizar).toHaveBeenCalledOnce();
  });
});

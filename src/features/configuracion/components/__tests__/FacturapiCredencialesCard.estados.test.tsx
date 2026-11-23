import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import FacturapiCredencialesCard from "../FacturapiCredencialesCard";

const mocks = vi.hoisted(() => ({ query: vi.fn(), refetch: vi.fn() }));
vi.mock("@/lib/contexts/OrganizationContext", () => ({
  useOrganization: () => ({ organization: { id: "org-test" } }),
}));
vi.mock("@/hooks/shared", () => ({ useCopyText: () => vi.fn() }));
vi.mock("@/features/configuracion/hooks/useFacturapiCredenciales", () => ({
  useFacturapiCredenciales: mocks.query,
  useUpsertFacturapiCredenciales: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../FacturapiWebhookUrlSection", () => ({ FacturapiWebhookUrlSection: () => null }));
vi.mock("../FacturapiOnboardingWizard", () => ({ default: () => null }));
vi.mock("../FacturapiApiKeyRow", () => ({ FacturapiApiKeyRow: () => null }));

const datosGuardados = { ambiente: "sandbox", api_key_sandbox_last4: "TEST" };

beforeEach(() => {
  mocks.query.mockReturnValue({ data: datosGuardados, refetch: mocks.refetch });
  mocks.refetch.mockClear();
});

it("mantiene el ambiente confirmado en el encabezado al editar el borrador", () => {
  render(<FacturapiCredencialesCard />);
  fireEvent.click(screen.getByText("Modo avanzado — editar campos manualmente"));
  fireEvent.click(screen.getByRole("switch", { name: "Cambiar ambiente" }));
  expect(screen.getByRole("heading", { name: /FacturApi.*Configurado Sandbox/ })).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("Ambiente activo: Sandbox. Cambiará a Producción al guardar.");
  expect(screen.getByRole("button", { name: "Activar Producción" })).toBeEnabled();
});

it("ofrece reintento y bloquea la edición mientras la lectura falle", () => {
  mocks.query.mockReturnValue({ data: datosGuardados, isError: true, refetch: mocks.refetch });
  render(<FacturapiCredencialesCard />);
  expect(screen.getByRole("alert")).toHaveTextContent("Última lectura disponible · Sandbox");
  expect(screen.queryByRole("button", { name: "Guardar configuración" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reconfigurar" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(mocks.refetch).toHaveBeenCalledOnce();
});

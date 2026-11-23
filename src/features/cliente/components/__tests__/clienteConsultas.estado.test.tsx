import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import TablaContactos from "../TablaContactos";
import TabPortalCliente from "../TabPortalCliente";

const mocks = vi.hoisted(() => ({ portal: vi.fn(), reintentar: vi.fn() }));
vi.mock("@/features/cliente/hooks", () => ({
  useClientUsers: mocks.portal,
  useRevokeClientUser: () => ({ isPending: false }),
  useResendClientUserInvite: () => ({ isPending: false }),
}));
vi.mock("../PortalInviteDialog", () => ({ default: () => null }));

describe("Consultas de la ficha de cliente", () => {
  beforeEach(() => vi.clearAllMocks());

  it("distingue una lectura fallida de contactos de un catálogo confirmado vacío", () => {
    const vista = (error: Error | null) => (
      <MemoryRouter>
        <TablaContactos contactos={[]} isLoading={false} isFetching={false} error={error}
          onRetry={mocks.reintentar} canEdit onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />
      </MemoryRouter>
    );
    const { rerender } = render(vista(new Error("lectura fallida")));
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos consultar los contactos");
    expect(screen.queryByText("Sin contactos registrados")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.reintentar).toHaveBeenCalledOnce();
    rerender(vista(null));
    expect(screen.getByText("Sin contactos registrados")).toBeVisible();
  });

  it("no presenta cero accesos si falló la lectura del portal y recupera los estados de invitación", () => {
    mocks.portal.mockReturnValue({ isError: true, refetch: mocks.reintentar });
    const vista = (
      <MemoryRouter><TabPortalCliente clienteId="cliente-demo" organizationId="org-demo" canEdit={false} /></MemoryRouter>
    );
    const { rerender } = render(vista);
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos consultar los accesos al portal");
    expect(screen.queryByText("Sin acceso")).not.toBeInTheDocument();
    expect(screen.queryByText(/No hay usuarios con acceso/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.reintentar).toHaveBeenCalledOnce();
    mocks.portal.mockReturnValue({
      data: [{ id: "acceso-demo", email: "contacto@ejemplo.test", email_confirmed_at: null, last_sign_in_at: null }],
    });
    rerender(<MemoryRouter><TabPortalCliente clienteId="cliente-demo" organizationId="org-demo" canEdit={false} /></MemoryRouter>);
    expect(screen.getByText("1 usuario con acceso")).toBeVisible();
    expect(screen.getByText("Pendiente")).toBeVisible();
  });
});

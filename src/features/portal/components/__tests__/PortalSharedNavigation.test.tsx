import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { PortalUserMenu } from "@/components/layout/portal/PortalUserMenu";
import { PortalBreadcrumbsBar } from "@/components/layout/portal/PortalBreadcrumbsBar";
import { ROUTES } from "@/constants/routes";
import { PortalEmbarquesRecientesCard } from "../dashboard/PortalEmbarquesRecientesCard";
import { PortalProximosArribosCard } from "../dashboard/PortalProximosArribosCard";

describe("navegación compartida de portales", () => {
  it("cada acción Ver todos renderiza un único enlace enfocable", () => {
    const { container } = render(<MemoryRouter>
      <PortalEmbarquesRecientesCard embarques={[]} />
      <PortalProximosArribosCard items={[]} />
    </MemoryRouter>);
    const links = screen.getAllByRole("link", { name: "Ver todos" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", ROUTES.PORTAL_EMBARQUES);
      expect(link.tabIndex).toBe(0);
    }
    expect([...container.querySelectorAll("a[href], button, [tabindex='0']")]).toEqual(links);
  });

  it.each([ROUTES.PORTAL_PERFIL, ROUTES.AGENTE_PERFIL])("usa la ruta de perfil del portal %s", async (perfilRoute) => {
    render(<MemoryRouter><PortalUserMenu initials="LC" onSignOut={vi.fn()}
      perfilRoute={perfilRoute} /></MemoryRouter>);
    fireEvent.keyDown(screen.getByRole("button", { name: "Menú de usuario" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: "Mi perfil" })).toHaveAttribute("href", perfilRoute);
  });

  it("conserva el enlace de la miga anterior y el texto de la página actual", () => {
    render(<MemoryRouter><PortalBreadcrumbsBar breadcrumbs={[
      { href: ROUTES.PORTAL_EMBARQUES, label: "Embarques" },
      { href: `${ROUTES.PORTAL_EMBARQUES}/fixture`, label: "Detalle" },
    ]} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Embarques" })).toHaveAttribute("href", ROUTES.PORTAL_EMBARQUES);
    expect(screen.getByText("Detalle")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Detalle" })).toBeNull();
  });
});

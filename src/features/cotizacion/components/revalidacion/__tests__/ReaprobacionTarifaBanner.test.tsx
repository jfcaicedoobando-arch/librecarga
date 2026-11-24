import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router";
import { ReaprobacionTarifaBanner } from "../ReaprobacionTarifaBanner";
import { recotizarCotizacion } from "@/features/cotizacion/services/versionado";

const estado = vi.hoisted(() => ({ rol: "vendedor" }));

vi.mock("@/features/cotizacion/hooks/useRevalidacionTarifa", () => ({
  useResolverReaprobacion: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false }),
}));
vi.mock("@/hooks/shared", () => ({
  usePermissions: () => ({ canApproveTarifaCotizacion: ["vendedor", "admin", "ejecutivo_pricing"].includes(estado.rol) }),
}));
vi.mock("@/features/cotizacion/services/versionado", () => ({
  recotizarCotizacion: vi.fn(),
}));

function Path() {
  return <output data-testid="ruta">{useLocation().pathname}</output>;
}

function renderBanner(props: Parameters<typeof ReaprobacionTarifaBanner>[0]) {
  const cache = new QueryClient();
  const invalidateQueries = vi.spyOn(cache, "invalidateQueries");
  const view = render(
    <QueryClientProvider client={cache}>
      <MemoryRouter>
        <ReaprobacionTarifaBanner {...props} />
        <Path />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, invalidateQueries };
}

describe("ReaprobacionTarifaBanner (B-097)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    estado.rol = "vendedor";
  });

  it("no se pinta cuando la cotización no está pendiente de re-aprobación", () => {
    renderBanner({ cotizacionId: "c1", estado: "Aceptada" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("usa copy de vigencia cuando la tarifa está vencida", () => {
    renderBanner({
      cotizacionId: "c1",
      estado: "pendiente_reaprobacion",
      deltaJsonb: { tarifa_vigente: false },
    });
    expect(screen.getByText(/tarifa vinculada está vencida/)).toBeInTheDocument();
  });

  it("usa copy de cambio de precio cuando la tarifa sigue vigente", () => {
    renderBanner({
      cotizacionId: "c1",
      estado: "pendiente_reaprobacion",
      deltaJsonb: { tarifa_vigente: true, conceptos: 3 },
    });
    expect(screen.getByText(/cambios en la tarifa vigente/)).toBeInTheDocument();
    expect(screen.getByText(/3 concepto\(s\) afectado\(s\)/)).toBeInTheDocument();
  });

  it("ofrece las tres decisiones de ventas", () => {
    renderBanner({ cotizacionId: "c1", estado: "pendiente_reaprobacion", estadoCotizacion: "Aceptada" });
    expect(screen.getByRole("button", { name: /Re-aprobar manteniendo precio/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Re-cotizar con tarifa vigente/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rechazar/ })).toBeInTheDocument();
  });

  it("invalida las listas de pendientes y su contador al recotizar con éxito", async () => {
    vi.mocked(recotizarCotizacion).mockResolvedValueOnce({ version_anterior: 1, version_nueva: 2 });
    const { invalidateQueries } = renderBanner({
      cotizacionId: "c1", estado: "pendiente_reaprobacion", estadoCotizacion: "Aceptada",
    });
    fireEvent.click(screen.getByRole("button", { name: "Re-cotizar con tarifa vigente" }));
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent("/cotizaciones/c1/editar"));
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["cotizaciones"] });
  });

  /**
   * v13.823.349 — resolver la re-aprobación es escritura de cotizaciones: los
   * roles financieros/lectura ven el aviso pero no botones que la RPC rechaza.
   */
  /**
   * v13.823.351 — `recotizar_cotizacion` sólo acepta estado `Aceptada`: en
   * `En operación` el CTA fallaba siempre y ya no se pinta.
   */
  it("oculta Re-cotizar cuando la cotización ya está En operación", () => {
    renderBanner({ cotizacionId: "c1", estado: "pendiente_reaprobacion", estadoCotizacion: "En operación" });
    expect(screen.getByRole("button", { name: /Re-aprobar manteniendo precio/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Re-cotizar con tarifa vigente/ })).toBeNull();
  });

  /**
   * v13.823.351 — operación y finanzas ven el aviso, pero sólo el rol aprobador
   * (ventas/administración/pricing) decide.
   */
  it.each(["viewer", "contador", "tesorero", "operador"])("oculta las acciones para %s", (rol) => {
    estado.rol = rol;
    renderBanner({ cotizacionId: "c1", estado: "pendiente_reaprobacion" });
    expect(screen.getByText(/Tarifa pendiente de re-aprobación/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Re-aprobar/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Rechazar/ })).toBeNull();
  });
});

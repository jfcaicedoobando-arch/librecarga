import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { BandejaPricingPanel } from "../BandejaPricingPanel";

const { leerDetalle, leerBandeja, reintentar } = vi.hoisted(() => ({
  leerDetalle: vi.fn(), leerBandeja: vi.fn(), reintentar: vi.fn(),
}));
const solicitud = { id: "qa-solicitud", folio: "PRI-QA", estado: "enviada" };

vi.mock("@/features/crm/hooks/usePricingCrm", () => ({
  useBandejaPricing: (estado: string) => ({
    data: { filas: [solicitud], total: 40 },
    ...leerBandeja(estado),
  }),
  useSolicitudPricing: (id: string | null) => leerDetalle(id),
}));
vi.mock("../ModosEjecutivoPanel", () => ({ ModosEjecutivoPanel: () => null }));
vi.mock("../TabsModoPricing", () => ({ TabsModoPricing: () => null, useModoPropioPricing: () => "todos" }));
vi.mock("@/lib/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveRole: "ejecutivo_pricing", user: { id: "u" } }) }));
vi.mock("../SolicitudPricingDetalle", () => ({
  SolicitudPricingDetalle: () => <p>Respuesta de prueba</p>,
}));

function ConsultaActiva() {
  const [params] = useSearchParams();
  return <output aria-label="Consulta actual">{params.toString()}</output>;
}

function renderizar(url: string) {
  return <MemoryRouter initialEntries={[url]}><BandejaPricingPanel /><ConsultaActiva /></MemoryRouter>;
}

describe("Bandeja de pricing", () => {
  it("muestra los plazos vigentes y enfoca el detalle sin perder los filtros", () => {
    leerDetalle.mockReturnValue({ isLoading: true });
    render(renderizar("/costeo/tarifas?tab=bandeja&estado=todos&p=1"));
    expect(screen.getByText(/sin contador.*36 h.*48 h/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /PRI-QA/ }));
    expect(screen.getByRole("heading", { name: "Detalle de la solicitud" })).toHaveFocus();
    expect(screen.getByText("Cargando el detalle de la solicitud…")).toBeVisible();
    expect(screen.getByRole("button", { name: /PRI-QA/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Consulta actual")).toHaveTextContent("estado=todos&p=1&id=qa-solicitud");
  });

  it("distingue un fallo recuperable, una solicitud ausente y la respuesta cargada", () => {
    leerDetalle.mockReturnValue({ isError: true, refetch: reintentar });
    const vista = render(renderizar("/costeo/tarifas?tab=bandeja&id=qa-solicitud"));
    const region = screen.getByRole("region", { name: "Detalle de la solicitud" });
    expect(region).toHaveTextContent("No se pudo cargar el detalle de la solicitud.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reintentar).toHaveBeenCalledOnce();
    expect(leerDetalle).toHaveBeenLastCalledWith("qa-solicitud");

    leerDetalle.mockReturnValue({ data: null });
    vista.rerender(renderizar("/costeo/tarifas?tab=bandeja&id=qa-solicitud"));
    expect(region).toHaveTextContent("La solicitud no está disponible");
    leerDetalle.mockReturnValue({ data: solicitud });
    vista.rerender(renderizar("/costeo/tarifas?tab=bandeja&id=qa-solicitud"));
    expect(region).toHaveTextContent("Respuesta de prueba");
  });

  it("ajusta una página inexistente y conserva estado y detalle", () => {
    leerDetalle.mockReturnValue({ data: solicitud });
    render(renderizar("/costeo/tarifas?tab=bandeja&estado=todos&p=999&id=qa-solicitud"));
    expect(screen.getByLabelText("Consulta actual")).toHaveTextContent("estado=todos&p=1&id=qa-solicitud");
    expect(screen.getByText("Respuesta de prueba")).toBeVisible();
  });

  it("quita un índice negativo sin perder la solicitud", () => {
    leerDetalle.mockReturnValue({ data: solicitud });
    render(renderizar("/costeo/tarifas?tab=bandeja&estado=todos&p=-2&id=qa-solicitud"));
    expect(screen.getByLabelText("Consulta actual")).toHaveTextContent("estado=todos&id=qa-solicitud");
  });

  it("oculta filas provisionales mientras cambia el filtro sin perder el detalle", () => {
    leerDetalle.mockReturnValue({ data: solicitud });
    leerBandeja.mockReturnValueOnce({ isPlaceholderData: true });
    render(renderizar("/costeo/tarifas?tab=bandeja&estado=cancelada&id=qa-solicitud"));
    expect(screen.getByText("Actualizando solicitudes…").closest('[role="status"]')).toBeVisible();
    expect(screen.queryByRole("button", { name: /PRI-QA/ })).not.toBeInTheDocument();
    expect(screen.getByText("Respuesta de prueba")).toBeVisible();
  });
});

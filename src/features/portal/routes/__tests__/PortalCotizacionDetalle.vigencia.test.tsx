import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import PortalCotizacionDetalle from "../PortalCotizacionDetalle";

const { usePortalCotizacion } = vi.hoisted(() => ({ usePortalCotizacion: vi.fn() }));
vi.mock("@/features/portal/hooks", () => ({ usePortalCotizacion }));

function mostrar(fechaVigencia: string | null, estado = "Enviada") {
  usePortalCotizacion.mockReturnValue({ data: {
    id: "cot-1", folio: "COT-001", cliente_nombre: "Cliente prueba", estado, fecha_vigencia: fechaVigencia,
    modo: "Marítimo", tipo: "Importación", incoterm: "FOB", moneda: "MXN", subtotal: 100, conceptos_venta: [],
  } });
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/portal/cotizaciones/cot-1"]}>
        <Routes>
          <Route path="/portal/cotizaciones/:id" element={<PortalCotizacionDetalle />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Vigencia de cotización en el portal", () => {
  beforeEach(() => vi.setSystemTime(new Date("2026-11-23T02:00:00Z"))); // El día de negocio todavía es 22/11 en México.
  afterEach(() => vi.useRealTimers());

  it("explica el vencimiento, bloquea Aceptar en las dos vistas y conserva Rechazar", () => {
    mostrar("2026-11-21");
    const aceptar = screen.getAllByRole("button", { name: /^Aceptar/ });
    expect(aceptar).toHaveLength(2);
    for (const boton of aceptar) {
      expect(boton).toBeDisabled();
      fireEvent.click(boton);
    }
    expect(screen.queryByRole("dialog")).toBeNull();
    const rechazar = screen.getAllByRole("button", { name: "Rechazar" });
    expect(rechazar).toHaveLength(2);
    for (const boton of rechazar) expect(boton).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/venció el .*21.*11.*2026.*Solicita una actualización/);
  });

  it.each(["2026-11-22", "2026-11-23", null])("conserva Aceptar con vigencia %s", (fecha) => {
    mostrar(fecha);
    for (const boton of screen.getAllByRole("button", { name: /^Aceptar/ })) expect(boton).toBeEnabled();
    expect(screen.getByText(/pendiente de tu respuesta/)).toBeInTheDocument();
  });

  it("conserva el mensaje de una cotización ya aceptada aunque su fecha haya pasado", () => {
    mostrar("2026-11-21", "Aceptada");
    expect(screen.getByText(/Aceptaste esta cotización/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Aceptar/ })).toBeNull();
  });
});

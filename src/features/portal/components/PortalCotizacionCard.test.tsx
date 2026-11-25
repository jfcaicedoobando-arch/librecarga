import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { PortalCotizacionCard, type PortalCotizacionCardRow } from "./PortalCotizacionCard";

const cotizacion: PortalCotizacionCardRow = {
  id: "cotizacion-demo", folio: "COT-100", estado: "aceptada",
  modo: "Marítimo", tipo: "Importación", moneda: "MXN",
};

it("expone los enlaces de cotización y embarque en orden y sin controles anidados", () => {
  render(<PortalCotizacionCard tasaIva={0.16} cotizacion={{
    ...cotizacion, embarque_id: "embarque-demo", embarque_expediente: "EXP-100",
  }} />, { wrapper: MemoryRouter });

  const [detalle, embarque] = screen.getAllByRole("link");
  expect(detalle).toHaveAttribute("href", "/portal/cotizaciones/cotizacion-demo");
  expect(embarque).toHaveAttribute("href", "/portal/embarques/embarque-demo");
  expect(detalle).not.toContainElement(embarque);
  expect(detalle.tabIndex).toBe(0);
  expect(embarque.tabIndex).toBe(0);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("muestra sólo el enlace de cotización si todavía no hay embarque vinculado", () => {
  render(<PortalCotizacionCard tasaIva={0.16} cotizacion={cotizacion} />, { wrapper: MemoryRouter });
  expect(screen.getAllByRole("link")).toHaveLength(1);
});

import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClienteDetalleTablasTabs } from "../_sections/ClienteDetalleTablasTabs";

function Ficha({ pestaña, ...props }: ComponentProps<typeof ClienteDetalleTablasTabs> & {
  pestaña: "embarques" | "cotizaciones";
}) {
  return (
    <MemoryRouter>
      <Tabs value={pestaña}>
        <TabsList>
          <TabsTrigger value="embarques">Embarques</TabsTrigger>
          <TabsTrigger value="cotizaciones">Cotizaciones</TabsTrigger>
        </TabsList>
        <ClienteDetalleTablasTabs {...props} />
      </Tabs>
    </MemoryRouter>
  );
}

function estado() {
  return {
    canEdit: false,
    embarquesCliente: [],
    loadingEmbarques: false,
    errorEmbarques: null,
    refetchEmbarques: vi.fn(),
    fetchingEmbarques: false,
    cotizacionesCliente: [],
    loadingCotizaciones: false,
    errorCotizaciones: null,
    refetchCotizaciones: vi.fn(),
    fetchingCotizaciones: false,
  };
}

const error = new Error("Consulta fallida");

describe("Relaciones en el detalle de clientes", () => {
  it("distingue un fallo de embarques del vacío y sólo reintenta embarques", () => {
    const props = estado();
    const { rerender } = render(<Ficha pestaña="embarques" {...props} errorEmbarques={error} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar los embarques");
    expect(screen.queryByText("Sin embarques registrados")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(props.refetchEmbarques).toHaveBeenCalledOnce();
    expect(props.refetchCotizaciones).not.toHaveBeenCalled();

    rerender(<Ficha pestaña="embarques" {...props} errorEmbarques={error} fetchingEmbarques />);
    expect(screen.getByRole("button", { name: "Reintentando…" })).toBeDisabled();

    rerender(<Ficha pestaña="embarques" {...props} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Sin embarques registrados")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Embarques", selected: true })).toBeVisible();
  });

  it("reintenta cotizaciones y conserva los resultados disponibles al fallar su actualización", () => {
    const props = estado();
    const { rerender } = render(<Ficha pestaña="cotizaciones" {...props} errorCotizaciones={error} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar las cotizaciones");
    expect(screen.queryByText("Sin cotizaciones registradas")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Nueva cotización" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(props.refetchCotizaciones).toHaveBeenCalledOnce();
    expect(props.refetchEmbarques).not.toHaveBeenCalled();

    const cotizacionesCliente = [{
      id: "cot-qa", folio: "COT-QA", modo: "Terrestre", estado: "Borrador",
      origen: "Puebla", destino: "Querétaro", subtotal: 100, moneda: "MXN", created_at: "2026-11-17",
    }];
    rerender(<Ficha pestaña="cotizaciones" {...props} cotizacionesCliente={cotizacionesCliente} errorCotizaciones={error} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos actualizar las cotizaciones");
    expect(screen.getByText("COT-QA")).toBeVisible();

    rerender(<Ficha pestaña="cotizaciones" {...props} cotizacionesCliente={cotizacionesCliente} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("COT-QA")).toBeVisible();
  });
});

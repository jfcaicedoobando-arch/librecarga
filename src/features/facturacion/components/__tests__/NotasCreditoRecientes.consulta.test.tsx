import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotasCreditoRecientes } from "../NotasCreditoRecientes";

const { query, media } = vi.hoisted(() => ({ query: vi.fn(), media: { mobile: false } }));
vi.mock("@/features/facturacion/hooks", () => ({ useNotasCreditoRecientes: query }));
vi.mock("@/hooks/shared/useIsMobile", () => ({ useIsMobile: () => media.mobile }));
vi.mock("../NotasCreditoZipButton", () => ({
  NotasCreditoZipButton: ({ alcance, notas }: { alcance: string; notas: { id: string }[] }) => (
    <button data-notas={notas.map((nota) => nota.id).join(",")}>Descargar ZIP de {alcance} ({notas.length})</button>
  ),
}));

function RutaActual() {
  return <output data-testid="ruta">{useLocation().pathname}</output>;
}

const abrirNotas = () => fireEvent.click(screen.getByRole("button", { name: "Mostrar u ocultar notas de crédito recientes" }));

describe("Notas de crédito recientes", () => {
  beforeEach(() => { media.mobile = false; });

  it("explica el límite y cambia el alcance del ZIP al seleccionar y cambiar de cliente", async () => {
    const datos = { motivo: "Ajuste", factura_id: "f1", factura_numero: "F1", estado: "Timbrada", fecha_emision: "2026-11-04", moneda: "MXN", monto: 100 };
    query.mockReturnValue({ data: [
      { ...datos, id: "n1", folio: "NC1", cliente_id: "c1", cliente_nombre: "Cliente Uno" },
      { ...datos, id: "n2", folio: "NC2", cliente_id: "c2", cliente_nombre: "Cliente Dos" },
    ], isLoading: false, isError: false });
    render(<MemoryRouter><NotasCreditoRecientes /></MemoryRouter>);
    abrirNotas();
    expect(screen.getByText(/Hasta 200 notas recientes/)).toBeInTheDocument();
    expect(screen.getByText("Importe de notas visibles sin canceladas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descargar ZIP de filtradas (2)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar NC1" }));
    expect(screen.getByRole("button", { name: "Descargar ZIP de seleccionadas (1)" })).toBeInTheDocument();

    fireEvent.keyDown(screen.getAllByRole("combobox")[1], { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: /Cliente Dos/i }));
    expect(screen.getByRole("button", { name: "Descargar ZIP de filtradas (1)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Limpiar selección" })).not.toBeInTheDocument();
  });

  it("distingue el error de consulta de una lista realmente vacía", () => {
    const refetch = vi.fn();
    query.mockReturnValue({ isLoading: false, isError: true, refetch });
    const { rerender } = render(<MemoryRouter><NotasCreditoRecientes /></MemoryRouter>);
    abrirNotas();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar las notas de crédito recientes");
    expect(screen.queryByText("No hay notas de crédito que coincidan.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Descargar ZIP/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();

    query.mockReturnValue({ data: [], isLoading: false, isError: false });
    rerender(<MemoryRouter><NotasCreditoRecientes /></MemoryRouter>);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("No hay notas de crédito que coincidan.")).toBeInTheDocument();
  });

  it.each([["escritorio", false], ["móvil", true]] as const)(
    "en %s selecciona las notas descargables y separa la selección de la navegación",
    (_vista, mobile) => {
      media.mobile = mobile;
      const datos = { motivo: "Ajuste", cliente_id: "c1", cliente_nombre: "Cliente Uno", fecha_emision: "2026-11-04", moneda: "MXN", monto: 100 };
      query.mockReturnValue({ data: [
        { ...datos, id: "n1", folio: "NC1", estado: "Timbrada", factura_id: "f1", factura_numero: "F1" },
        { ...datos, id: "n2", folio: "NC2", estado: "Borrador", factura_id: "f2", factura_numero: "F2" },
        { ...datos, id: "n3", folio: "NC3", estado: "Cancelada", factura_id: "f3", factura_numero: "F3" },
      ], isLoading: false, isError: false });
      render(<MemoryRouter><NotasCreditoRecientes /><RutaActual /></MemoryRouter>);
      abrirNotas();
      expect(Boolean(screen.queryByRole("table"))).toBe(!mobile);

      const todas = screen.getByRole("checkbox", { name: "Seleccionar todas las descargables" });
      const primera = screen.getByRole("checkbox", { name: "Seleccionar NC1" });
      const tercera = screen.getByRole("checkbox", { name: "Seleccionar NC3" });
      expect(screen.queryByRole("checkbox", { name: "Seleccionar NC2" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Descargar ZIP de filtradas (2)" })).toHaveAttribute("data-notas", "n1,n3");
      primera.focus();
      fireEvent.click(primera);
      expect(primera).toBeChecked();
      expect(primera).toHaveFocus();
      expect(todas).toBePartiallyChecked();
      expect(screen.getByRole("button", { name: "Descargar ZIP de seleccionadas (1)" })).toHaveAttribute("data-notas", "n1");
      expect(screen.getByTestId("ruta")).toHaveTextContent("/");

      fireEvent.click(todas);
      expect(todas).toBeChecked();
      expect(tercera).toBeChecked();
      expect(screen.getByRole("button", { name: "Descargar ZIP de seleccionadas (2)" })).toHaveAttribute("data-notas", "n1,n3");
      fireEvent.click(screen.getByRole("button", { name: "Limpiar selección" }));
      expect(primera).not.toBeChecked();
      expect(tercera).not.toBeChecked();

      fireEvent.click(tercera);
      const enlace = screen.getByRole("link", { name: "Ver factura F3" });
      if (mobile) {
        expect(tercera.closest("a, [role=link]")).toBeNull();
        expect(enlace).toHaveAttribute("href", "/facturacion/f3");
        fireEvent.click(enlace);
      } else {
        fireEvent.keyDown(enlace, { key: " " });
      }
      expect(screen.getByTestId("ruta")).toHaveTextContent("/facturacion/f3");
    },
  );
});

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { NotasCreditoRecientes } from "../NotasCreditoRecientes";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/features/facturacion/hooks", () => ({ useNotasCreditoRecientes: query }));
vi.mock("../NotasCreditoZipButton", () => ({
  NotasCreditoZipButton: ({ alcance, notas }: { alcance: string; notas: unknown[] }) => <button>Descargar ZIP de {alcance} ({notas.length})</button>,
}));

describe("Notas de crédito recientes", () => {
  it("explica el límite y cambia el alcance del ZIP al seleccionar y cambiar de cliente", async () => {
    const datos = { motivo: "Ajuste", factura_id: "f1", factura_numero: "F1", estado: "Timbrada", fecha_emision: "2026-11-04", moneda: "MXN", monto: 100 };
    query.mockReturnValue({ data: [
      { ...datos, id: "n1", folio: "NC1", cliente_id: "c1", cliente_nombre: "Cliente Uno" },
      { ...datos, id: "n2", folio: "NC2", cliente_id: "c2", cliente_nombre: "Cliente Dos" },
    ], isLoading: false, isError: false });
    render(<MemoryRouter><NotasCreditoRecientes /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Mostrar u ocultar notas de crédito recientes" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Mostrar u ocultar notas de crédito recientes" }));
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
});

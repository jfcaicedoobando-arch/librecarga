import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PagosTable } from "../DialogDetallePagosProveedor.sections";

describe("consulta de pagos de factura de proveedor", () => {
  it("distingue el error, permite reintentar y anuncia el vacío tras una consulta correcta", () => {
    const onRetry = vi.fn();
    const props = { pagos: [], isLoading: false, canEdit: false, onRetry, onEliminarPago: vi.fn() };
    const estadoVacio = "No hay pagos registrados para esta factura.";
    const { rerender } = render(<PagosTable {...props} isError retrying={false} />);

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar los pagos de esta factura");
    expect(screen.queryByText(estadoVacio)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledOnce();

    rerender(<PagosTable {...props} isError retrying />);
    expect(screen.getByRole("button", { name: "Reintentando…" })).toBeDisabled();

    rerender(<PagosTable {...props} isError={false} retrying={false} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(estadoVacio)).toBeVisible();
  });
});

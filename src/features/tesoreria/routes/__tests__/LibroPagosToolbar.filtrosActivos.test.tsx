import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FILTROS_LIBRO_PAGOS_INICIALES, type FiltrosLibroPagos } from "@/features/tesoreria/domain/libroPagos";
import { LibroPagosToolbar } from "../_sections/LibroPagosToolbar";

const props = {
  cuentas: [{ id: "cuenta", alias: "Cuenta demo", moneda: "MXN" }],
  monedas: ["MXN"],
  metodos: ["Transferencia"],
  rango: { desde: "2026-10-01", hasta: "2026-10-31" },
  onFiltrosChange: vi.fn(),
  onRangoChange: vi.fn(),
};

describe("Más filtros en Libro de pagos", () => {
  it("cuenta sólo los filtros dentro del panel y actualiza el indicador al quitarlos", () => {
    const basicos: FiltrosLibroPagos = { ...FILTROS_LIBRO_PAGOS_INICIALES, vista: "recibidos", texto: "cliente" };
    const avanzados: FiltrosLibroPagos = {
      ...basicos, cuentaId: "cuenta", moneda: "MXN", metodo: "Transferencia", conciliacion: "pendientes", rep: "timbrado",
    };
    const { rerender } = render(<LibroPagosToolbar {...props} filtros={avanzados} />);
    const resumen = screen.getByText("Más filtros").closest("summary")!;

    expect(within(resumen).getByText("5")).toBeInTheDocument();
    expect(resumen).toHaveTextContent("5 filtros activos");

    rerender(<LibroPagosToolbar {...props} filtros={{ ...basicos, rep: "timbrado" }} />);
    expect(within(resumen).getByText("1")).toBeInTheDocument();
    expect(resumen).toHaveTextContent("1 filtro activo");

    rerender(<LibroPagosToolbar {...props} filtros={basicos} />);
    expect(resumen).toHaveTextContent(/^Más filtros$/);
  });
});

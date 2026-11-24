import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { FacturaEstadoCuenta } from "@/features/facturacion/estadoCuenta/services/estadoCuenta";
import { DialogEnviarEstadoCuenta } from "../DialogEnviarEstadoCuenta";

const { enviar } = vi.hoisted(() => ({ enviar: vi.fn() }));
vi.mock("@/features/cobranza/hooks/useEstadoCuentaEmail", () => ({
  useEstadoCuentaEmail: () => ({ mutate: enviar, isPending: false }),
}));

const factura = (
  moneda: FacturaEstadoCuenta["moneda"],
  total: number,
  saldo: number,
  dias_vencido: number,
): FacturaEstadoCuenta => ({
  id: `${moneda}-${total}`, numero: "F-1", cliente_id: "cliente", cliente_nombre: "Empresa",
  expediente: "", moneda, total, pagado: total - saldo, notas_credito_aplicadas: 0, saldo,
  fecha_emision: "2026-11-01", fecha_vencimiento: "2026-11-10", dias_vencido,
  estatus_cobranza: dias_vencido > 0 ? "Vencida" : "Vigente", estado_factura: "Emitida",
  pagos: [], notas_credito: [],
});

describe("resumen para enviar el estado de cuenta", () => {
  it("presenta importes por moneda y conserva el alcance de envío por cliente y período", () => {
    render(<DialogEnviarEstadoCuenta
      open onOpenChange={vi.fn()} clienteId="cliente" clienteNombre="Empresa"
      periodo="noviembre" desde="2026-11-01" hasta="2026-11-30"
      rows={[factura("MXN", 200, 123, 2), factura("MXN", 300, 110, 0), factura("USD", 50, 30, 0), factura("EUR", 19, 15, 3)]}
    />);

    expect(screen.getByText("Resumen de filas visibles")).toBeVisible();
    expect(screen.getByText(`${formatDate("2026-11-01")} al ${formatDate("2026-11-30")}`)).toBeVisible();
    expect(screen.getByText("El correo toma el periodo completo. Los importes de abajo resumen las filas visibles.")).toBeVisible();
    for (const [moneda, importes] of [["MXN", [500, 233, 123]], ["USD", [50, 30, 0]], ["EUR", [19, 15, 15]]] as const) {
      const importesMostrados = within(screen.getByLabelText(`Importes en ${moneda}`)).getAllByRole("definition");
      expect(importesMostrados.map((elemento) => elemento.textContent)).toEqual(importes.map((valor) => formatCurrency(valor, moneda)));
    }
    expect(enviar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Enviar estado de cuenta" }));
    expect(enviar).toHaveBeenCalledExactlyOnceWith({
      clienteId: "cliente", periodo: "noviembre", fechaDesde: "2026-11-01", fechaHasta: "2026-11-30",
      contactoEmail: undefined, mensaje: undefined,
    });
  });
});

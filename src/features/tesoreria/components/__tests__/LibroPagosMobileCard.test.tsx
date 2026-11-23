/** v13.823.25: tarjeta móvil del libro de pagos muestra contraparte/folio/monto. */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LibroPagosMobileCard } from "../LibroPagosMobileCard";
import type { PagoLibro } from "@/features/tesoreria/domain/libroPagos";

function pago(overrides: Partial<PagoLibro> = {}): PagoLibro {
  return {
    id: "1", tipo: "cobro", fecha: "2026-01-01", contraparte: "Cliente X",
    documento_folio: "F-1", metodo_pago: "03", referencia: null,
    cuenta_alias: "BBVA MXN", monto: 500, moneda: "MXN", monto_mxn: 500,
    conciliado: false, estado_rep: null, notas: null, lote_id: null,
    contraparte_id: null, documento_id: null, cuenta_bancaria_id: null, cuenta_banco: null,
    tipo_cambio: 1, embarque_id: null, diferencia_cambiaria_mxn: 0, folio_rep: null,
    es_ajuste: false, es_anticipo_aplicado: false, movimiento_id: null, created_at: null,
    ...overrides,
  };
}

describe("LibroPagosMobileCard", () => {
  it.each(["pago", "cobro"] as const)("distingue un ajuste %s con badge e importe neutros, sin inferir por referencia", (tipo) => {
    const row = Object.freeze(pago({ tipo, es_ajuste: true, referencia: null, monto: 1 }));
    const { container } = render(<LibroPagosMobileCard row={row} />);
    const badge = screen.getByText("Ajuste no monetario");
    expect(badge).toHaveClass("text-foreground");
    expect(screen.getByText("Importe ajustado")).toBeVisible();
    expect(screen.getByText("MXN 1.00")).toHaveClass("text-foreground");
    expect(container.querySelector('[data-domain="pago_tipo"]')).not.toBeInTheDocument();
    expect(screen.queryByText("Pago a proveedor")).not.toBeInTheDocument();
    expect(screen.queryByText("Pago", { exact: true })).not.toBeInTheDocument();
    expect(row.monto).toBe(1);
  });

  it("un pago ordinario conserva su tipo e importe aunque la referencia diga ajuste", () => {
    const row = pago({ tipo: "pago", referencia: "Cierre sin pago: condonacion", monto: 116 });
    const { container } = render(<LibroPagosMobileCard row={row} />);
    expect(screen.getByText("Pago a proveedor")).toBeVisible();
    expect(screen.getByText("Pago", { exact: true })).toBeVisible();
    expect(container.querySelector('[data-domain="pago_tipo"]')).toHaveAttribute("data-status", "pago");
    expect(screen.getByText("Monto")).toBeVisible();
    expect(screen.getByText("MXN 116.00")).toBeVisible();
    expect(screen.queryByText("Ajuste no monetario")).not.toBeInTheDocument();
  });
  it("muestra contraparte, folio y monto con moneda", () => {
    render(<LibroPagosMobileCard row={pago()} />);
    expect(screen.getByText("Cliente X")).toBeInTheDocument();
    expect(screen.getByText("F-1")).toBeInTheDocument();
    expect(screen.getByText(/500\.00/)).toBeInTheDocument();
  });

  it.each([
    ["  Cancelado ", true, "REP · Cancelado", "Conciliación · Conciliado"],
    [null, false, "REP · Pendiente", "Conciliación · Pendiente"],
    ["NoAplica", false, "REP · No aplica", "Conciliación · Pendiente"],
  ] as const)("aplica los mismos estados REP y conciliación que la tabla", (estado_rep, conciliado, rep, banco) => {
    render(<LibroPagosMobileCard row={pago({ estado_rep, conciliado })} />);
    expect(screen.getByText(rep)).toBeVisible();
    expect(screen.getByText(banco)).toBeVisible();
  });

  it("distingue un ajuste sin conciliación y sin REP de cobro", () => {
    const { container } = render(<LibroPagosMobileCard row={pago({ tipo: "pago", es_ajuste: true })} />);
    expect(screen.getByText("Conciliación · No aplica")).toBeVisible();
    expect(container.querySelector('[data-domain="rep"]')).not.toBeInTheDocument();
  });
});

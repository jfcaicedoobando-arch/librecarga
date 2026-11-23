import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DialogCobroLoteDatos } from "../DialogCobroLoteDatos";
import { NotaCreditoConceptosEditor } from "../detalle/NotaCreditoConceptosEditor";

vi.mock("@/features/configuracion", () => ({ useIvaFronteraHabilitada: () => false }));
vi.mock("@/features/facturacion/services/pagoClienteLote", () => ({ round2: (importe: number) => importe }));

describe("Etiquetas de captura financiera", () => {
  it("expone nombre y formato de fecha en cobro en lote", () => {
    const onFecha = vi.fn();
    render(<DialogCobroLoteDatos moneda="MXN" fecha="2026-11-01" onFecha={onFecha}
      total="100" onTotal={vi.fn()} saldoTotal={100} tcDof={null} formaPago="03" onFormaPago={vi.fn()}
      cuentaId="" onCuentaId={vi.fn()} cuentasMoneda={[]} referencia="" onReferencia={vi.fn()} />);
    const fecha = screen.getByRole("textbox", { name: "Fecha del cobro" });
    expect(fecha).toHaveAccessibleDescription("Formato DD/MM/AAAA.");
    fireEvent.change(fecha, { target: { value: "04/11/2026" } });
    fireEvent.blur(fecha);
    expect(onFecha).toHaveBeenCalledWith("2026-11-04");
  });

  it("distingue los controles de cada renglón de la nota de crédito", () => {
    const onRemove = vi.fn();
    render(<NotaCreditoConceptosEditor conceptos={[
      { descripcion: "Flete", cantidad: 1, precio_unitario: 100, tasa_iva: 0, tipo_iva: "tasa_0" },
      { descripcion: "Maniobras", cantidad: 1, precio_unitario: 200, tasa_iva: 0, tipo_iva: "tasa_0" },
    ]} monedaFactura="MXN" onAdd={vi.fn()} onUpdate={vi.fn()} onRemove={onRemove} />);
    const primerConcepto = within(screen.getByRole("group", { name: "Concepto 1" }));
    const segundoConcepto = within(screen.getByRole("group", { name: "Concepto 2" }));
    expect(primerConcepto.getByRole("textbox", { name: "Descripción del concepto 1" })).toHaveValue("Flete");
    expect(segundoConcepto.getByRole("textbox", { name: "Descripción del concepto 2" })).toHaveValue("Maniobras");
    fireEvent.click(segundoConcepto.getByRole("button", { name: "Eliminar concepto 2" }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });
});

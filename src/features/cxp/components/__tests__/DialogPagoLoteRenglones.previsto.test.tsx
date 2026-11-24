import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DialogPagoLoteRenglones } from "../DialogPagoLoteRenglones";

it("muestra los resultados del reparto como previsiones antes de guardar", () => {
  render(<DialogPagoLoteRenglones moneda="MXN" onMontoChange={vi.fn()}
    facturas={[
      { factura_id: "f1", folio_proveedor: "A-20", fecha_vencimiento: null, saldo: 250 },
      { factura_id: "f2", folio_proveedor: "A-30", fecha_vencimiento: null, saldo: 250 },
    ]}
    renglones={[{ factura_id: "f1", monto: 250 }, { factura_id: "f2", monto: 20 }]}
  />);
  expect(screen.getByRole("columnheader", { name: "Saldo previsto" })).toBeInTheDocument();
  expect(screen.getByText("Quedará liquidada")).toBeInTheDocument();
  expect(screen.getByText("Pago parcial propuesto")).toBeInTheDocument();
});

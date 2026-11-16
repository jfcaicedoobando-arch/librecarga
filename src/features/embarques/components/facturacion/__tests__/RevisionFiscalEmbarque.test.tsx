import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fiscalCotizacionFixture } from "@/test/fixtures/snapshotFiscalCotizacion";
import { RevisionFiscalEmbarque } from "../RevisionFiscalEmbarque";

const antes = fiscalCotizacionFixture({ cliente_id: "moral" });
const despues = fiscalCotizacionFixture({
  cliente_id: "fisica",
  bloques: [{ moneda: "MXN", subtotal: 200.8, iva: 32.13, ret_isr: 0, ret_iva: 0, total: 232.93 }],
});
const clientes = [{ id: "moral", nombre: "Cliente moral" }, { id: "fisica", nombre: "Cliente físico" }];

describe("revisión fiscal del embarque", () => {
  it("muestra el neto anterior, el nuevo y la diferencia antes de autorizar", () => {
    const responder = vi.fn();
    render(<RevisionFiscalEmbarque propuesta={{ antes, despues, huella: "a".repeat(64), puede_autorizar: true }}
      clientes={clientes} responder={responder} />);
    expect(screen.getByRole("dialog", { name: "Revisión fiscal del embarque" })).toBeInTheDocument();
    expect(screen.getByText(/Cliente anterior.*Cliente moral/)).toBeInTheDocument();
    expect(screen.getByText(/Cliente propuesto.*Cliente físico/)).toBeInTheDocument();
    expect(screen.getByText(/230\.42/)).toBeInTheDocument();
    expect(screen.getByText(/232\.93/)).toBeInTheDocument();
    expect(screen.getByText(/Diferencia del neto MXN/)).toBeInTheDocument();
    expect(screen.getByText(/^\+.*2\.51/)).toBeInTheDocument();
    const autorizar = screen.getByRole("button", { name: "Autorizar y guardar" });
    expect(autorizar).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Motivo de la revisión/), { target: { value: "  Cambio de cliente aprobado  " } });
    fireEvent.click(autorizar);
    expect(responder).toHaveBeenCalledExactlyOnceWith("Cambio de cliente aprobado");
  });

  it("muestra cómo proceder a los operadores sin permiso de autorización", () => {
    const responder = vi.fn();
    render(<RevisionFiscalEmbarque propuesta={{ antes, despues, huella: "a".repeat(64), puede_autorizar: false }}
      clientes={clientes} responder={responder} />);
    expect(screen.queryByRole("button", { name: "Autorizar y guardar" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Pide a Administración o Contabilidad");
    fireEvent.click(screen.getByText("Cerrar", { selector: "button" }));
    expect(responder).toHaveBeenCalledExactlyOnceWith(null);
  });
});

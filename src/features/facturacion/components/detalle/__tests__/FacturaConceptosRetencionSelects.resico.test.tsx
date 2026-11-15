import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RetencionSelects } from "../FacturaConceptosRetencionSelects";
import { FormRow } from "../FacturaConceptosEditorRows";
import { RetBadges } from "../FacturaConceptosEditorBadges";
import type { ConceptoFacturaInput } from "../../../services/conceptosFacturaCrud";

vi.mock("@/features/configuracion", () => ({ useIvaFronteraHabilitada: () => false }));
afterEach(cleanup);

describe("ISR RESICO en el editor existente", () => {
  it("abre 1.25% sin emitir un cambio y conserva la selección al refrescar", () => {
    const onChange = vi.fn();
    const { rerender } = render(<RetencionSelects tasaIsr={0.0125} tasaIva={0.04} onChange={onChange} />);
    expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("ISR 1.25% (RESICO)");
    rerender(<RetencionSelects tasaIsr={0.0125} tasaIva={0.106667} onChange={onChange} />);
    expect(screen.getAllByRole("combobox")[0]).toHaveTextContent("ISR 1.25% (RESICO)");
    expect(onChange).not.toHaveBeenCalled();
  });
  it("selecciona 1.25% sin modificar IVA", async () => {
    const onChange = vi.fn();
    render(<RetencionSelects tasaIsr={0} tasaIva={0.04} onChange={onChange} />);
    fireEvent.keyDown(screen.getAllByRole("combobox")[0], { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "ISR 1.25% (RESICO)" }));
    expect(onChange).toHaveBeenCalledWith({ tasa_ret_isr: 0.0125 });
  });
  it("editar descripción conserva ISR y la retención de IVA guardados", () => {
    const setDraft = vi.fn();
    const draft: ConceptoFacturaInput = { descripcion: "Servicio", cantidad: 1, precio_unitario: 10000,
      clave_sat: "78101800", tipo_iva: "gravado_16", tasa_ret_isr: 0.0125, tasa_ret_iva: 0.04 };
    render(<FormRow draft={draft} setDraft={setDraft} onSave={vi.fn()} onCancel={vi.fn()} busy={false} />);
    fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Servicio actualizado" } });
    expect(setDraft).toHaveBeenLastCalledWith({ ...draft, descripcion: "Servicio actualizado" });
  });
  it("mantiene el selector deshabilitado para No objeto", () => {
    render(<RetencionSelects tasaIsr={0} tasaIva={0} onChange={vi.fn()} disabled hint="No objeto" />);
    for (const combo of screen.getAllByRole("combobox")) expect(combo).toBeDisabled();
  });
  it("muestra 1.25% y 4% en la lectura sin redondear ISR a entero", () => {
    render(<RetBadges isr={0.0125} iva={0.04} />);
    expect(screen.getByText("ISR 1.25%")).toBeInTheDocument();
    expect(screen.getByText("IVA 4%")).toBeInTheDocument();
  });
});

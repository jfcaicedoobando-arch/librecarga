import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
const registro = vi.hoisted(() => ({ registrar: vi.fn(), pendiente: false }));
vi.mock("@/features/tesoreria/hooks/useTraspasos", () => ({ useRegistrarTraspaso: () => ({ mutate: registro.registrar, isPending: registro.pendiente }) }));
vi.mock("@/features/tesoreria/hooks/useTraspasoForm", () => ({
  useTraspasoForm: () => ({
    state: { origenId: "a", destinoId: "b", fecha: "2026-09-30", montoOrigen: 100, comision: 0, concepto: "", referencia: "" },
    setField: vi.fn(), mismoMoneda: true, factorOrigenDestino: 1, montoDestino: 100,
    error: null, fechaInicial: "2026-09-30", tcEsManual: false,
  }),
  traspasoSucio: () => false, partesTraspaso: () => ({}), conceptoTraspaso: () => "Traspaso",
}));
vi.mock("@/components/shared/FormDialogShell", () => ({
  FormDialogShell: ({ children, footer, onSubmit, busy }: { children: ReactNode; footer: ReactNode; onSubmit: React.FormEventHandler; busy: boolean }) =>
    <form onSubmit={onSubmit} aria-busy={busy} data-testid="traspaso-form">{children}{footer}<button type="submit">Intentar submit</button></form>,
}));
vi.mock("@/components/shared/FormDialogFooter", () => ({
  FormDialogFooter: ({ disabled, confirmLabel }: { disabled: boolean; confirmLabel: string }) =>
    <button type="submit" disabled={disabled}>{confirmLabel}</button>,
}));
vi.mock("../TraspasoImportes", () => ({ TraspasoImportes: () => null }));
vi.mock("../TraspasoCuentaSelect", () => ({ TraspasoCuentaSelect: () => null }));
import { DialogTraspasoCuentas } from "../DialogTraspasoCuentas";
describe("N03 · candado del modal", () => {
  it("no llama la mutación con menos de dos cuentas aunque el formulario esté válido", () => {
    render(<DialogTraspasoCuentas open onOpenChange={vi.fn()} cuentas={[]} />);
    expect(screen.getByRole("button", { name: "Registrar traspaso" })).toBeDisabled();
    expect(screen.getByText(/Se necesitan al menos dos cuentas/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Intentar submit" }));
    expect(registro.registrar).not.toHaveBeenCalled();
  });

  it("marca el diálogo ocupado mientras espera el resultado del traspaso", () => {
    registro.pendiente = true;
    render(<DialogTraspasoCuentas open onOpenChange={vi.fn()} cuentas={[]} />);
    expect(screen.getByTestId("traspaso-form")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Registrando traspaso…" })).toBeDisabled();
  });
});

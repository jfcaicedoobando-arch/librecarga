/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FacturaManualDatosFiscales } from "../FacturaManualDatosFiscales";
import { INITIAL_FISCAL } from "../../hooks/facturaManualFormDefaults";
import { MSG_PUE_REQUIERE_FORMA_REAL } from "@/lib/financial/formaMetodoPago";

vi.mock("@/features/facturacion/hooks/useBanxicoTipoCambio", () => ({
  useBanxicoTipoCambio: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe("AUD51: advertencia junto a la forma de pago", () => {
  it("muestra cómo corregir PUE/99 antes de enviar y elimina el error con PUE/03", () => {
    const { rerender } = render(<FacturaManualDatosFiscales value={{ ...INITIAL_FISCAL, metodoPago: "PUE" }} onChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(MSG_PUE_REQUIERE_FORMA_REAL);
    expect(screen.getByRole("combobox", { name: "Forma de pago" })).toHaveAttribute("aria-invalid", "true");

    rerender(<FacturaManualDatosFiscales value={{ ...INITIAL_FISCAL, metodoPago: "PUE", formaPago: "03" }} onChange={vi.fn()} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Forma de pago" })).toBeEnabled();
  });

  it("PPD conserva 99 y no permite escoger una forma real por accidente", () => {
    const { rerender } = render(<FacturaManualDatosFiscales value={INITIAL_FISCAL} onChange={vi.fn()} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const formaPago = screen.getByRole("combobox", { name: "Forma de pago" });
    expect(formaPago).toBeDisabled();
    expect(formaPago).toHaveTextContent("99");
    expect(formaPago).toHaveAccessibleDescription("Con PPD, el sistema fija la forma de pago en 99 - Por definir.");

    rerender(<FacturaManualDatosFiscales value={{ ...INITIAL_FISCAL, metodoPago: "PUE", formaPago: "03" }} onChange={vi.fn()} />);
    expect(formaPago).toBeEnabled();
    expect(screen.queryByText(/Con PPD, el sistema fija/)).not.toBeInTheDocument();
  });
});

/** @vitest-environment jsdom */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FacturaManualDatosFiscales } from "../FacturaManualDatosFiscales";
import { INITIAL_FISCAL } from "../../hooks/facturaManualFormDefaults";
import { MSG_PUE_REQUIERE_FORMA_REAL } from "@/lib/financial/formaMetodoPago";

const useBanxico = vi.hoisted(() => vi.fn());
vi.mock("@/features/facturacion/hooks/useBanxicoTipoCambio", () => ({ useBanxicoTipoCambio: useBanxico }));

beforeEach(() => {
  useBanxico.mockReset();
  useBanxico.mockImplementation((_moneda, confirmar) => ({
    mutate: () => confirmar(20.45), isPending: false,
  }));
});

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

it("recorre las monedas por teclado y conserva la selección y el flujo del tipo de cambio", async () => {
  const onChange = vi.fn();
  const { rerender } = render(<FacturaManualDatosFiscales value={INITIAL_FISCAL} onChange={onChange} />);
  const monedas = screen.getByRole("radiogroup", { name: "Moneda" });
  expect(monedas).toBeRequired();
  const mxn = within(monedas).getByRole("radio", { name: "MXN" });
  const usd = within(monedas).getByRole("radio", { name: "USD" });
  expect(mxn).toBeChecked();
  expect(screen.getByRole("spinbutton", { name: "Tipo de cambio" })).toBeDisabled();
  fireEvent.click(mxn);
  expect(onChange).not.toHaveBeenCalled();

  act(() => mxn.focus());
  fireEvent.keyDown(mxn, { key: "ArrowRight" });
  await waitFor(() => expect(usd).toHaveFocus());
  expect(within(monedas).getAllByRole("radio").filter((radio) => radio.tabIndex === 0)).toEqual([usd]);
  fireEvent.click(usd);
  expect(onChange).toHaveBeenLastCalledWith({ moneda: "USD" });
  rerender(<FacturaManualDatosFiscales value={{ ...INITIAL_FISCAL, moneda: "USD" }} onChange={onChange} />);
  expect(usd).toBeChecked();
  expect(screen.getByRole("spinbutton", { name: "Tipo de cambio (MXN por 1 USD)" })).toBeEnabled();
  expect(useBanxico).toHaveBeenLastCalledWith("USD", expect.any(Function), INITIAL_FISCAL.fechaEmision);
  fireEvent.click(screen.getByRole("button", { name: "Traer TC DOF Banxico (USD/MXN)" }));
  expect(onChange).toHaveBeenLastCalledWith({ tipoCambio: 20.45 });

  const eur = within(monedas).getByRole("radio", { name: "EUR" });
  fireEvent.click(eur);
  expect(onChange).toHaveBeenLastCalledWith({ moneda: "EUR" });
  rerender(<FacturaManualDatosFiscales value={{ ...INITIAL_FISCAL, moneda: "EUR", tipoCambio: 20.45 }} onChange={onChange} />);
  expect(eur).toBeChecked();
  expect(screen.getByRole("spinbutton", { name: "Tipo de cambio (MXN por 1 EUR)" })).toHaveValue(20.45);
  expect(screen.getByRole("button", { name: "Traer TC DOF Banxico (EUR/MXN)" })).toBeEnabled();
});

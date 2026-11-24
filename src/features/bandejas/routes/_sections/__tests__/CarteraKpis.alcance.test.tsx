import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CarteraKpis } from "../CarteraKpis";

vi.mock("@/features/catalogos/hooks", () => ({ useExchangeRates: () => ({ data: undefined }) }));

it("aclara el alcance de los indicadores sin cambiar el saldo del grupo", () => {
  const props = {
    totalFacturas: 2,
    saldosNativos: { MXN: 100, USD: 0, EUR: 0, otras: {} },
    vencidasCount: 0,
    vencidoNativo: { MXN: 0, USD: 0, EUR: 0, otras: {} },
    eqTotal: { totalMxn: 100, facturasSinTc: 0 },
    eqVencido: { totalMxn: 0, facturasSinTc: 0 },
  };
  const { rerender } = render(<CarteraKpis {...props} />);
  const alcance = /La búsqueda y las fechas solo filtran el listado/;
  expect(screen.queryByText(alcance)).not.toBeInTheDocument();
  rerender(<CarteraKpis {...props} mostrarAlcance />);
  expect(screen.getByText(alcance)).toBeInTheDocument();
  expect(screen.getByText(/100\.00/)).toBeInTheDocument();
});

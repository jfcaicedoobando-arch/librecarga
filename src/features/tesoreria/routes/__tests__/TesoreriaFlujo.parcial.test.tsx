import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { formatCurrency } from "@/lib/formatters";
import { calcularFlujoProyectado } from "../../domain/flujoProyectado";
import TesoreriaFlujo from "../TesoreriaFlujo";

const consulta = vi.hoisted(() => vi.fn());
vi.mock("@/features/tesoreria/hooks", () => ({ useFlujoProyectado: consulta }));
vi.mock("@/features/tesoreria/components/GraficoFlujoProyectado", () => ({ default: () => <span data-testid="grafico-listo" /> }));
vi.mock("@/features/tesoreria/components/TablaFlujoSemanal", () => ({ default: () => <span data-testid="tabla-lista" /> }));

describe("Saldo final del flujo de caja proyectado", () => {
  it.each([true, false])("identifica las exclusiones de moneda en el propio indicador (parcial=%s)", async (saldoIncompleto) => {
    const data = calcularFlujoProyectado({
      dias: 90, hoy: new Date(2026, 10, 23),
      cuentas: [
        { id: "c-mxn", alias: "Operativa MXN", banco: "Banco", moneda: "MXN", saldo: 800 },
        { id: "c-usd", alias: "Operativa USD", banco: "Banco", moneda: "USD", saldo: 17 },
      ],
      cobranza: [], cxp: [], liquidaciones: [],
      tipoCambioUsd: saldoIncompleto ? undefined : 18,
    });
    consulta.mockReturnValue({ data });
    const label = saldoIncompleto ? "Saldo final proyectado parcial" : "Saldo final proyectado";
    render(<MemoryRouter><TesoreriaFlujo /></MemoryRouter>);
    await screen.findByTestId("grafico-listo");
    await screen.findByTestId("tabla-lista");
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getAllByText(formatCurrency(data.saldo_final_mxn, "MXN"))).not.toHaveLength(0);
  });
});

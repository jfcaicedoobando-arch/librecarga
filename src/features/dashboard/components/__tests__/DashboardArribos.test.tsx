import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ArribosCard, type ArribosEsteMes } from "../statusCards/ArribosCard";
import { ProximosArribosCard } from "../ProximosArribosCard";

const arribosEsteMes: ArribosEsteMes = {
  total: 3,
  yaLlegaron: 1,
  enCamino: 2,
  profitUSD: 0,
  ventaMXN: 2000,
  costoMXN: 1000,
  profitMXN: 1000,
  ventaMxnFromUsd: 0,
  costoMxnFromUsd: 0,
  ventaMxnFromEur: 0,
  costoMxnFromEur: 0,
  ventaMxnNative: 2000,
  costoMxnNative: 1000,
  gastosOperativosMXN: 0,
};

describe("Copy de arribos en Inicio", () => {
  it("aclara el alcance mensual y permite consultar por qué falta la base de cobertura", () => {
    render(<ArribosCard arribosEsteMes={arribosEsteMes} isLoading={false} />);
    expect(screen.getByRole("heading", { name: "Arribos del mes según ETA" })).toBeInTheDocument();
    expect(screen.getByText("Pendientes de arribo")).toBeInTheDocument();
    expect(screen.getByText("Cobertura proyectada de gastos fijos")).toBeInTheDocument();
    const boton = screen.getByRole("button", { name: /Ver cálculo de cobertura.*Sin base para calcular/ });
    expect(within(boton).queryByRole("progressbar", { hidden: true })).not.toBeInTheDocument();

    fireEvent.click(boton);

    expect(boton).toHaveAttribute("aria-expanded", "true");
    const detalle = screen.getByRole("dialog", { name: "Cálculo de la cobertura de gastos fijos" });
    expect(within(detalle).getByText("Se necesita un importe de gastos fijos mayor a cero para calcular la cobertura.")).toBeInTheDocument();
  });

  it("describe una cobertura de 100 % como resultado proyectado", () => {
    render(<ArribosCard arribosEsteMes={{ ...arribosEsteMes, gastosOperativosMXN: 1000 }} isLoading={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Ver cálculo de cobertura.*100%/ }));

    const detalle = screen.getByRole("dialog", { name: "Cálculo de la cobertura de gastos fijos" });
    expect(within(detalle).getByText("La utilidad proyectada alcanza para cubrir los gastos incluidos del mes.")).toBeInTheDocument();
    expect(within(detalle).queryByText(/utilidad neta/i)).not.toBeInTheDocument();
  });

  it("no anuncia falta de base mientras carga el resumen", () => {
    render(<ArribosCard arribosEsteMes={arribosEsteMes} isLoading />);
    expect(screen.queryByText("Sin base para calcular")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver cálculo de cobertura/ })).not.toBeInTheDocument();
  });

  it("explica el alcance de los próximos arribos aunque todavía no haya filas", () => {
    render(
      <MemoryRouter>
        <ProximosArribosCard arribos={[]} isLoading={false} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Próximos arribos (7 días)" })).toBeInTheDocument();
    expect(screen.getByText("Embarques en tránsito")).toBeInTheDocument();
    expect(screen.getByText("Sin arribos previstos en ese periodo")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { EmbarquesActivosTable } from "../EmbarquesActivosTable";
import { EMPTY_RESUMEN, type EmbarqueMesSiguiente } from "../../domain/parsers/dashboardTypes";

const resumen = { ...EMPTY_RESUMEN, nombreMes: "diciembre 2026" };

const embarque: EmbarqueMesSiguiente = {
  id: "demo-1",
  expediente: "ELDEMO001",
  cliente_nombre: "Cliente demo",
  modo: "Terrestre",
  tipo: "Exportación",
  estado: "Confirmado",
  estadoReal: "Confirmado",
  operador: "demo",
  etd: null,
  eta: "2026-12-18",
  created_at: "2026-11-24",
  ventaUSD: 0,
  costoUSD: 0,
  profit: 0,
  margen: 0,
  ventaMXN: 1_000,
  costoMXN: 700,
  profitMXN: 300,
  margenMXN: 30,
  tipoCambioUSD: 18,
  tipoCambioEUR: 20,
  ventaMxnFromUsd: 0,
  costoMxnFromUsd: 0,
  ventaMxnFromEur: 0,
  costoMxnFromEur: 0,
  ventaMxnNative: 1_000,
  costoMxnNative: 700,
  facturado: true,
};

describe("Embarques del próximo mes", () => {
  it("muestra una sola explicación cuando no hay filas", () => {
    render(<EmbarquesActivosTable embarques={[]} resumen={resumen} isLoading={false} />);

    expect(screen.getByText("Sin embarques activos con llegada prevista en diciembre de 2026")).toBeVisible();
    expect(screen.queryByText("0/0")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/Desplaza horizontalmente/)).not.toBeInTheDocument();
  });

  it("muestra carga mientras espera el listado", () => {
    render(<EmbarquesActivosTable embarques={[]} resumen={resumen} isLoading />);

    expect(screen.getByText("Cargando embarques del próximo mes…")).toBeVisible();
    expect(screen.queryByText(/Sin embarques activos/)).not.toBeInTheDocument();
  });

  it("mantiene el expediente y el avance cuando hay embarques", () => {
    render(
      <MemoryRouter>
        <EmbarquesActivosTable
          embarques={[embarque]}
          resumen={{ ...resumen, totalEmbarques: 1, facturados: 1 }}
          isLoading={false}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Resumen de los embarques mostrados.")).toBeVisible();
    expect(screen.getByText("ELDEMO001")).toBeVisible();
    expect(screen.getByText("1/1")).toBeVisible();
  });
});

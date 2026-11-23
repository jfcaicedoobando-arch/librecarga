/**
 * B1 (v13.823.395): «Cargar costos» depende de la capacidad estrecha
 * `canEditCostos`, no del `canEdit` genérico. Los roles operativos que sólo
 * LEEN costos no deben ver la acción de captura.
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TabCostos } from "../TabCostos";
import type { FilaReconciliacion } from "@/features/embarques/services/reconciliacionCostos";

const { consulta, reintentar } = vi.hoisted(() => ({ consulta: vi.fn(), reintentar: vi.fn() }));

vi.mock("@/features/embarques/hooks", () => ({
  useContenedoresEmbarque: () => ({ data: [] }),
}));
vi.mock("@/features/embarques/hooks/useReconciliacionEmbarque", () => ({
  useReconciliacionEmbarque: consulta,
}));
vi.mock("../costos/AnticiposEmbarqueCard", () => ({
  AnticiposEmbarqueCard: () => null,
}));

const respuesta = (data: FilaReconciliacion[] | undefined, isError: boolean) => ({
  data, isError, isLoading: false, isFetching: false, refetch: reintentar,
});
beforeEach(() => {
  vi.clearAllMocks();
  consulta.mockReturnValue(respuesta([], false));
});

const tab = (canEditCostos: boolean) => (
  <MemoryRouter>
    <TabCostos
      conceptosCosto={[]}
      totalVenta={0}
      totalCosto={0}
      utilidad={0}
      margen={0}
      embarqueId="emb-1"
      canEditCostos={canEditCostos}
    />
  </MemoryRouter>
);

describe("TabCostos · acción «Cargar costos»", () => {
  it("la muestra a quien puede editar costos", () => {
    render(tab(true));
    expect(screen.getAllByRole("button", { name: /Cargar costos/i }).length).toBeGreaterThan(0);
  });

  it("la oculta a los roles operativos de sólo lectura de costos", () => {
    render(tab(false));
    expect(screen.queryAllByRole("button", { name: /Cargar costos/i })).toHaveLength(0);
  });

  it("distingue error, conserva los KPIs presupuestados y permite recuperar la consulta", () => {
    consulta.mockReturnValue(respuesta(undefined, true));
    const { rerender } = render(tab(true));
    expect(screen.getByText("Venta presupuestada")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron consultar los costos directos");
    expect(screen.queryByText("Sin costos directos del embarque")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cargar costos" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reintentar).toHaveBeenCalledOnce();
    consulta.mockReturnValue(respuesta([], false));
    rerender(tab(true));
    expect(screen.getByText("Sin costos directos del embarque")).toBeVisible();
    expect(screen.getByText("Cargar costos", { selector: "button" })).toBeEnabled();
  });

  it("muestra la tasa USD usada sin redondearla a dos decimales", () => {
    render(
      <MemoryRouter>
        <TabCostos
          conceptosCosto={[]}
          totalVenta={75350.48}
          totalCosto={64852.59}
          utilidad={10497.89}
          margen={13.9}
          embarqueId="emb-1"
          tipoCambioUsd={18.071}
          monedasExtranjeras={["USD"]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("tipo-cambio-kpis")).toHaveTextContent("1 USD = MXN 18.0710");
  });
});


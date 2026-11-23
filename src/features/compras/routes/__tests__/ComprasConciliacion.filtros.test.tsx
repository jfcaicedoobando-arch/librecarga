import { fireEvent, render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { formatCurrency } from "@/lib/formatters";
import { createWrapper } from "@/test/utils/queryWrapper";
import type { EmbarqueConciliacion } from "@/features/compras/services/conciliacionEmbarques";
import ComprasConciliacion from "../ComprasConciliacion";

const { listar } = vi.hoisted(() => ({ listar: vi.fn() }));
vi.mock("@/hooks/shared/useOrgFilter", () => ({ useOrgFilter: () => ({ organizationId: "org-qa", orgListo: true }) }));
vi.mock("@/features/compras/services/conciliacionEmbarques", () => ({ listarConciliacionEmbarques: listar }));
vi.mock("../_sections/ConciliacionDetalleSheet", () => ({
  ConciliacionDetalleSheet: ({ embarque }: { embarque: EmbarqueConciliacion | null }) =>
    embarque ? <p>Detalle de {embarque.expediente}</p> : null,
}));

const embarque: EmbarqueConciliacion = {
  embarque_id: "e-qa",
  expediente: "EXP-QA",
  cliente_nombre: "Cliente sintético",
  estado: "En tránsito",
  moneda: "MXN",
  presupuestado: 100,
  facturado: 0,
  pendiente: 100,
  cobertura: 0,
  conceptos_pendientes: 1,
  conceptos_total: 1,
  pendientes_tc: 0,
  estado_conciliacion: "sin_facturar",
};

function mostrarConsulta(searchParams: string) {
  const onUrlUpdate = vi.fn();
  render(
    <MemoryRouter>
      <NuqsTestingAdapter hasMemory searchParams={searchParams} onUrlUpdate={onUrlUpdate}>
        <ComprasConciliacion />
      </NuqsTestingAdapter>
    </MemoryRouter>,
    { wrapper: createWrapper() },
  );
  return onUrlUpdate;
}

describe("estado sin resultados de Conciliación con embarques", () => {
  it("restablece los tres filtros y conserva la navegación a un detalle", async () => {
    listar.mockImplementation(async ({ search, moneda, estado }) =>
      search || moneda || estado !== "todos" ? [] : [embarque]);
    const onUrlUpdate = mostrarConsulta("?q=sin-resultados&moneda=USD&estado=parcial&origen=qa");

    expect(await screen.findByText("No hay resultados con los filtros actuales.")).toBeVisible();
    expect(screen.queryByText("No hay embarques con conceptos de costo para conciliar.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    fireEvent.click(await screen.findByText("EXP-QA"));
    expect(screen.getByText("Detalle de EXP-QA")).toBeVisible();
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(onUrlUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ queryString: "?origen=qa" }));
  });

  it("mantiene el mensaje de cero embarques cuando no se aplicaron filtros", async () => {
    listar.mockResolvedValue([]);
    mostrarConsulta("");
    expect(await screen.findByText("No hay embarques con conceptos de costo para conciliar.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).not.toBeInTheDocument();
  });

  it("los indicadores distinguen carga, error y cero confirmado", async () => {
    listar.mockRejectedValueOnce(new Error("error de lectura")).mockResolvedValueOnce([]);
    mostrarConsulta("");
    expect(screen.getByText("Por facturar EUR (comparable)")).toBeVisible();
    expect(screen.queryByText(formatCurrency(0, "EUR"))).not.toBeInTheDocument();
    const retry = await screen.findByRole("button", { name: "Reintentar" });
    expect(screen.getAllByText("No disponible")).toHaveLength(7);
    fireEvent.click(retry);
    expect(await screen.findByText(formatCurrency(0, "EUR"))).toBeVisible();
  });
});

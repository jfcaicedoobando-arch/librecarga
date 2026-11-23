import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { buildFilasReconciliacion, calcularResumenPorEstatus, calcularResumenPorMoneda } from "@/features/embarques/services/reconciliacionCostos.helpers";
import { CuerpoTabla, ResumenGrid } from "../ConciliacionDetalleSections";

const filas = buildFilasReconciliacion(
  [{ id: "a", concepto: "Flete", proveedor_nombre: "Logística Regia", moneda: "USD", monto: 100, estado_liquidacion: "Pendiente" }],
  [{ monto: 872.61, concepto_costo_id: "a", descripcion: "Flete MTY", proveedor_facturas: { id: "f1", folio_proveedor: "MTY-1", estado: "Vigente", moneda: "MXN", tipo_cambio_usd: null, deleted_at: null } }],
);
const totales = calcularResumenPorMoneda(filas);
const costosHref = "/embarques/e1?tab=costos";

describe("ConciliacionDetalle sin TC", () => {
  it("KPI y footer muestran N/D y pendientes, no ahorro", () => {
    render(<ResumenGrid totalesPorMoneda={totales} resumenEstatus={calcularResumenPorEstatus(filas)} huerfanas={0} />);
    const kpi = screen.getByTestId("kpi-moneda-USD");
    expect(within(kpi).getAllByText("N/D")).toHaveLength(2);
    expect(screen.getByText("Pendiente de TC")).toBeInTheDocument();
  });

  it("fila N/D y factura en MXN con motivo", () => {
    render(<MemoryRouter><CuerpoTabla isLoading={false} filas={filas} expandidos={new Set(["a"])} onToggle={() => {}} costosHref={costosHref} totalesPorMoneda={totales} /></MemoryRouter>);
    const partida = screen.getByTestId("partida-excluida");
    expect(partida.textContent).toMatch(/872\.61/);
    expect(partida.textContent).toMatch(/sin tipo de cambio/);
    expect(partida.textContent).not.toMatch(/\$0\.00/);
    expect(within(partida).getByRole("link", { name: /Ver factura de proveedor MTY-1/ })).toHaveAttribute("href", "/compras/facturas/f1");
    expect(screen.getByRole("button", { name: "Ocultar partidas de Flete" })).toHaveAttribute("aria-expanded", "true");
    const footer = screen.getByTestId("total-moneda-USD");
    expect(footer.textContent).toMatch(/N\/D/);
    expect(footer.textContent).toMatch(/pendiente\(s\) de tipo de cambio/);
  });

  it("señala las partidas sin vínculo como no disponibles si falla sólo ese conteo", () => {
    render(<ResumenGrid totalesPorMoneda={totales} resumenEstatus={calcularResumenPorEstatus(filas)} />);
    expect(screen.getByText("Partidas sin vínculo válido").parentElement).toHaveTextContent("No disponible");
    expect(screen.getByTestId("kpi-moneda-USD")).toBeVisible();
  });

  it("identifica la navegación a los costos de un renglón sin factura", () => {
    const sinFactura = buildFilasReconciliacion(
      [{ id: "a", concepto: "Flete", proveedor_nombre: "Proveedor QA", moneda: "USD", monto: 100, estado_liquidacion: "Pendiente" }],
      [],
    );
    render(
      <MemoryRouter>
        <CuerpoTabla isLoading={false} filas={sinFactura} expandidos={new Set()} onToggle={() => {}} costosHref={costosHref}
          totalesPorMoneda={calcularResumenPorMoneda(sinFactura)} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Abrir costos del embarque" })).toHaveAttribute("href", costosHref);
  });
});

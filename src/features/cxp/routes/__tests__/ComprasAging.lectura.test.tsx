import { fireEvent, render, screen, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MemoryRouter } from "react-router";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { CUBETA_LABELS_LARGAS } from "@/lib/aging/buckets";
import Compras from "../Compras";
import CxpAging from "../CxpAging";

const { aging, exportar, refetch } = vi.hoisted(() => ({
  aging: vi.fn(), exportar: vi.fn(), refetch: vi.fn(),
}));
vi.mock("@/features/cxp/hooks/useCxpAging", () => ({ useCxpAging: aging }));
vi.mock("@/features/cxp/services/cxpAgingExport", () => ({ exportarCxpAgingCsv: exportar }));
vi.mock("@/features/cxp/components/AgingDrillDownDialog", () => ({ AgingDrillDownDialog: () => null }));
vi.mock("@/features/cxp/components/DialogNuevaFacturaProveedor", () => ({ DialogNuevaFacturaProveedor: () => null }));
vi.mock("@/features/cxp/hooks", () => ({ useFacturasCxP: () => ({
  data: [
    { id: "p", moneda: "MXN", total: 1000, saldo: 1000, estado_aprobacion: "pendiente" },
    { id: "d", moneda: "USD", total: 100, saldo: 100, estado_aprobacion: "pendiente" },
    { id: "e", moneda: "EUR", total: 85, saldo: 85, estado_aprobacion: "aprobada" },
  ],
  kpis: { por_pagar_mxn: 0, por_pagar_usd: 0, por_pagar_eur: 85 },
}) }));
vi.mock("@/features/cxp/hooks/useCxpPendientesAprobacion", () => ({ useCxpPendientesAprobacion: () => ({ data: 2 }) }));
vi.mock("@/features/bandejas/hooks/useBandejas", () => ({ useCxpPorCapturar: () => ({ data: [] }) }));
vi.mock("@/hooks/shared", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/hooks/shared")>(),
  usePermissions: () => ({ canCapturarFacturaProveedor: false }),
}));
vi.mock("../_sections/ComprasDashboardCards", () => ({
  TopProveedoresCard: () => null, UltimasFacturasCard: () => null,
}));
vi.mock("../_sections/ComprasAgingChart", () => ({ ComprasAgingChart: () => null }));
vi.mock("../_sections/ComprasCapturaTrend", () => ({ ComprasCapturaTrend: () => null }));

const proveedor = {
  proveedor_id: "p", proveedor_nombre: "Proveedor", moneda: "USD", saldo_total: 100, vigente: 100,
  d_1_30: 0, d_31_60: 0, d_61_90: 0, mas_90: 0, num_facturas: 1,
};
const reporteAging = {
  rowsFiltradas: [proveedor], monedas: ["USD"], monedaActiva: "USD", setMoneda: vi.fn(),
  totales: { vigente: 100, "1_30": 0, "31_60": 0, "61_90": 0, mas_90: 0 },
  isLoading: false, error: null, refetch,
};

describe("Indicadores financieros", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aging.mockReturnValue(reporteAging);
  });

  it("mantiene separados los importes pendientes y muestra el saldo aprobado en EUR", async () => {
    render(<MemoryRouter><TooltipProvider><Compras /></TooltipProvider></MemoryRouter>);
    const aprobar = screen.getByRole("link", { name: /Por aprobar/ });
    const detalle = [formatCurrency(1000, "MXN"), formatCurrency(100, "USD")].join(" · ");
    expect(aprobar).toHaveTextContent([formatCurrencyCompact(1000, "MXN"), formatCurrencyCompact(100, "USD")].join(" · "));
    fireEvent.focus(within(aprobar).getByText("2"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(detalle);
    expect(aprobar).not.toHaveTextContent(formatCurrency(1100, "MXN"));
    const pagar = screen.getByRole("link", { name: /Por pagar/ });
    expect(pagar).toHaveTextContent(formatCurrencyCompact(85, "EUR"));
  });

  it("oculta las cifras cacheadas y pausa la exportación hasta recuperar Antigüedad", () => {
    aging.mockReturnValue({ ...reporteAging, error: new Error("Consulta interrumpida") });
    const vista = <MemoryRouter><NuqsTestingAdapter><CxpAging /></NuqsTestingAdapter></MemoryRouter>;
    const { rerender } = render(vista);
    const exportarCsv = screen.getByRole("button", { name: "Exportar CSV" });
    expect(exportarCsv).toBeDisabled();
    expect(screen.queryByText(/^CSV:/)).not.toBeInTheDocument();
    expect(screen.queryByText(CUBETA_LABELS_LARGAS.vigente)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(exportar).not.toHaveBeenCalled();
    aging.mockReturnValue(reporteAging);
    rerender(<MemoryRouter><NuqsTestingAdapter><CxpAging /></NuqsTestingAdapter></MemoryRouter>);
    expect(exportarCsv).toBeEnabled();
    fireEvent.click(exportarCsv);
    expect(exportar).toHaveBeenCalledWith([proveedor], "USD", expect.any(String), { search: "", cubeta: "todas" });
  });
});

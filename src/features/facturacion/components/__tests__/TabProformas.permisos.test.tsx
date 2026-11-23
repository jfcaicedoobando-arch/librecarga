/**
 * v13.823.278 — En /proformas la casilla de selección y la acción
 * "Fusionar / Convertir a factura" son escritura fiscal: sólo se muestran a
 * quien puede emitir facturas (admin/contador). Vendedor y gerente comercial
 * consultan en modo lectura, sin casillas que terminaban en un botón
 * deshabilitado. El guard del backend no cambia.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { proformaFixture } from "./fixtures/proforma";

const permisos = { role: "admin", canEmitirFactura: true, canEditarProforma: false };
vi.mock("@/hooks/shared", async () => ({
  ...(await import("@/hooks/shared/useCargaExpirada")), usePermissions: () => permisos }));

const buildColumnsSpy = vi.fn((_args: Record<string, unknown>) => []);
vi.mock("../proformasColumns", () => ({
  buildProformasColumns: (args: Record<string, unknown>) => buildColumnsSpy(args),
}));

vi.mock("@/components/shared/dataTable/ResponsiveDataTable", () => ({
  ResponsiveDataTable: ({ data, emptyState }: { data: unknown[]; emptyState?: React.ReactNode }) => (
    <div data-testid="tabla">{data.length ? null : emptyState}</div>
  ),
}));
vi.mock("../ProformasFiltros", () => ({ default: () => <div /> }));
const consolidar = vi.fn().mockResolvedValue({ id: "consolidada" });
vi.mock("@/features/proformas/hooks", () => ({
  useConvertirProformaDirecto: () => ({ convertir: vi.fn(), isPending: false }),
  useConsolidarProformasFiscales: () => ({ mutateAsync: consolidar, isPending: false }),
}));

const proforma = proformaFixture();

const controller = {
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  search: "",
  setSearch: vi.fn(),
  filtroEstado: "todas",
  setFiltroEstado: vi.fn(),
  filtroCliente: "todos",
  setFiltroCliente: vi.fn(),
  filtroOperador: "todos",
  setFiltroOperador: vi.fn(),
  fechaDesde: "",
  setFechaDesde: vi.fn(),
  fechaHasta: "",
  setFechaHasta: vi.fn(),
  clientesDisponibles: [],
  operadoresDisponibles: [],
  clearFiltros: vi.fn(),
  proformas: [proforma],
  filtered: [proforma],
  paginated: [proforma],
  counts: { todas: 1 },
  csvColumns: [],
  csvRows: () => [],
  selectedIds: new Set(["p1"]),
  toggleSelected: vi.fn(),
  isConvertible: () => true,
  selectedProformas: [proforma],
  clearSelected: vi.fn(),
  seleccionFueraDeFiltros: 0,
  quitarSeleccionFueraDeFiltros: vi.fn(),
  fusionInfo: { sameCliente: true, clienteNombre: "ACME", organizationId: "o1", diasCredito: 30, sameTipo: true, sameDiasCredito: true },
  page: 0,
  totalPages: 1,
  setPage: vi.fn(),
  pageSize: 50,
  setPageSize: vi.fn(),
};

vi.mock("@/features/facturacion/hooks", () => ({
  useTabProformasController: () => controller,
}));

const { TabProformas } = await import("../TabProformas");

describe("TabProformas — selección según permiso de emisión", () => {
  beforeEach(() => {
    buildColumnsSpy.mockClear();
    permisos.canEmitirFactura = true;
    permisos.canEditarProforma = false;
    controller.selectedProformas = [proforma];
    controller.proformas = [proforma];
    controller.filtered = [proforma];
    controller.search = "";
    controller.counts.todas = 1;
    controller.setSearch.mockClear();
    controller.seleccionFueraDeFiltros = 0;
    controller.quitarSeleccionFueraDeFiltros.mockClear();
    consolidar.mockClear();
  });

  it("permite limpiar la búsqueda desde el panel aunque el conteo filtrado sea cero", () => {
    controller.search = "No existe";
    controller.filtered = [];
    controller.counts.todas = 0;
    render(<TabProformas />);
    expect(screen.getByText("Sin resultados para «No existe»")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Limpiar búsqueda", { selector: "button" }));
    expect(controller.setSearch).toHaveBeenCalledWith("");
  });

  it("ofrece ir a Embarques cuando todavía no hay ninguna proforma", () => {
    controller.filtered = [];
    controller.proformas = [];
    controller.counts.todas = 0;
    controller.selectedProformas = [];
    render(<MemoryRouter><TabProformas /></MemoryRouter>);
    expect(screen.getByText("Aún no hay proformas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Embarques" })).toHaveAttribute("href", "/embarques");
  });

  it("contador/operador con emisión: incluye la casilla de selección y la acción", () => {
    render(<TabProformas />);
    expect(buildColumnsSpy.mock.calls[0][0]).toHaveProperty("selection");
    expect(screen.getByRole("button", { name: /convertir a factura/i })).toBeInTheDocument();
  });

  it("vendedor / gerente comercial: sin casilla de selección ni acción de convertir", () => {
    permisos.canEmitirFactura = false;
    controller.seleccionFueraDeFiltros = 1;
    render(<TabProformas />);
    expect(buildColumnsSpy.mock.calls[0][0]).not.toHaveProperty("selection");
    expect(screen.queryByRole("button", { name: /convertir a factura/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /fusionar/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Quitar selección oculta" })).toBeNull();
  });

  it("explica el alcance del lote y permite quitar las proformas que quedaron fuera de la búsqueda", () => {
    controller.seleccionFueraDeFiltros = 1;
    render(<TabProformas />);
    expect(screen.getByRole("status")).toHaveTextContent("Una proforma seleccionada queda fuera de los filtros.");
    fireEvent.click(screen.getByRole("button", { name: "Quitar selección oculta" }));
    expect(controller.quitarSeleccionFueraDeFiltros).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /convertir a factura/i })).toBeEnabled();
  });

  it("operaciones consolida proformas fiscales pendientes y abre el nuevo detalle", async () => {
    permisos.canEmitirFactura = false;
    permisos.canEditarProforma = true;
    const fiscal = { estado: "confirmado" };
    controller.selectedProformas = [
      proformaFixture({ id: "p2", evaluacion_fiscal: fiscal }),
      proformaFixture({ id: "p1", evaluacion_fiscal: fiscal }),
    ];
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<TabProformas />} />
          <Route path="/proformas/consolidada" element={<p>Detalle consolidado</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: /fusionar|convertir a factura/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Consolidar proformas" }));
    await waitFor(() => expect(consolidar).toHaveBeenCalledWith(expect.objectContaining({
      proformaIds: ["p1", "p2"],
      embarqueId: "e1",
      organizationId: "org-sintetica",
    })));
    expect(await screen.findByText("Detalle consolidado")).toBeInTheDocument();
  });

  it("bloquea una selección fiscal mezclada con proformas históricas", () => {
    permisos.canEditarProforma = true;
    controller.selectedProformas = [proforma, proformaFixture({ id: "p2", evaluacion_fiscal: { estado: "confirmado" } })];
    render(<MemoryRouter><TabProformas /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Consolidar proformas" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(/mismo embarque, cliente y plazo de crédito/);
  });
});

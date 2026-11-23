import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { describe, expect, it, vi } from "vitest";
import { useEmbarquesFilters } from "../../hooks/useEmbarquesFilters";
import { buildEmbarquesPageActions } from "../../hooks/useEmbarquesPageActions";
import EmbarquesFiltros from "../EmbarquesFiltros";

const viewport = vi.hoisted(() => ({ movil: false }));
vi.mock("@/hooks/shared/useIsMobile", () => ({ useIsMobile: () => viewport.movil }));

function Listado() {
  const estado = useEmbarquesFilters();
  const f = estado.filters;
  const acciones = buildEmbarquesPageActions(estado);
  return (
    <EmbarquesFiltros
      search={estado.search}
      onSearchChange={estado.setSearch}
      onClearAll={acciones.limpiarFiltros}
      filterModo={f.modo}
      onFilterModoChange={acciones.setFilterModo}
      filterEstado={f.estado}
      onFilterEstadoChange={acciones.setFilterEstado}
      filterCliente={f.cliente}
      onFilterClienteChange={acciones.setFilterCliente}
      filterOperador={f.operador}
      onFilterOperadorChange={acciones.setFilterOperador}
      fechaDesde={f.fechaDesde}
      onFechaDesdeChange={acciones.setFechaDesde}
      fechaHasta={f.fechaHasta}
      onFechaHastaChange={acciones.setFechaHasta}
      clientes={[{ id: "cliente-qa", nombre: "Cliente de prueba" }]}
      operadores={[]}
    />
  );
}

function mostrarListado(searchParams: string, movil: boolean) {
  viewport.movil = movil;
  render(<Listado />, { wrapper: withNuqsTestingAdapter({ hasMemory: true, searchParams }) });
}

function abrirPanel(nombre: string) {
  fireEvent.click(screen.getByRole("button", { name: nombre }));
  return within(screen.getByRole("dialog", { name: "Filtros" }));
}

describe("EmbarquesFiltros", () => {
  it.each([
    ["estado=Borrador", "Estado: Borrador"],
    ["cliente=cliente-qa", "Cliente: Cliente de prueba"],
  ])("permite limpiar el filtro móvil %s aunque esté activo por sí solo", (parametro, chip) => {
    mostrarListado(`?${parametro}`, true);
    const panel = abrirPanel("Filtros 1");
    const limpiar = panel.getByRole("button", { name: "Limpiar" });
    expect(limpiar).toBeEnabled();
    fireEvent.click(limpiar);
    fireEvent.click(panel.getByRole("button", { name: "Aplicar" }));

    expect(screen.queryByRole("button", { name: `Quitar ${chip}` })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument();
  });

  it("restaura el filtro móvil al cerrar sin aplicar y conserva la búsqueda", () => {
    mostrarListado("?q=Mercancía&estado=Borrador", true);
    const panel = abrirPanel("Filtros 1");
    fireEvent.click(panel.getByRole("button", { name: "Limpiar" }));
    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(screen.getByRole("button", { name: "Quitar Estado: Borrador" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("Mercancía");
  });

  it("limpia los selectores y la búsqueda con la acción general", () => {
    mostrarListado("?q=Mercancía&estado=Borrador", false);
    expect(screen.getByRole("button", { name: "Filtros" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar todo" }));

    expect(screen.getByRole("combobox", { name: "Estado del embarque" })).toHaveTextContent("Todos los estados");
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("distingue los dos campos de fecha por sus etiquetas visibles", () => {
    mostrarListado("", false);
    const panel = abrirPanel("Filtros");

    expect(panel.getByLabelText("ETD desde")).toBe(panel.getByRole("textbox", { name: "ETD desde" }));
    expect(panel.getByLabelText("ETA hasta")).toBe(panel.getByRole("textbox", { name: "ETA hasta" }));
  });

  it("permite filtrar por En Proceso y conserva el valor en la URL", async () => {
    viewport.movil = false;
    const actualizarUrl = vi.fn<(evento: { searchParams: URLSearchParams }) => void>();
    render(<Listado />, { wrapper: withNuqsTestingAdapter({ hasMemory: true, onUrlUpdate: actualizarUrl }) });

    const estado = screen.getByRole("combobox", { name: "Estado del embarque" });
    fireEvent.keyDown(estado, { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "En Proceso" }));

    expect(estado).toHaveTextContent("En Proceso");
    expect(screen.getByRole("button", { name: "Quitar Estado: En Proceso" })).toBeInTheDocument();
    await waitFor(() => expect(actualizarUrl.mock.lastCall?.[0].searchParams.get("estado")).toBe("En Proceso"));
  });
});

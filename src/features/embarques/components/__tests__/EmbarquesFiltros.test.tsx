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
    <>
      <output data-testid="pagina-listado">{estado.page + 1}</output>
      <EmbarquesFiltros
        search={estado.search}
        onSearchChange={estado.setSearch}
        onClearAll={acciones.limpiarFiltros}
        onApplyFilters={estado.applyFilters}
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
        operadores={["Operador de prueba"]}
      />
    </>
  );
}

function mostrarListado(searchParams: string, movil: boolean) {
  viewport.movil = movil;
  const onUrlUpdate = vi.fn<(evento: { searchParams: URLSearchParams }) => void>();
  render(<Listado />, { wrapper: withNuqsTestingAdapter({ hasMemory: true, searchParams, onUrlUpdate }) });
  return onUrlUpdate;
}

function abrirPanel(nombre: string) {
  fireEvent.click(screen.getByRole("button", { name: nombre }));
  return within(screen.getByRole("dialog", { name: "Filtros" }));
}

async function elegirFiltro(panel: ReturnType<typeof within>, nombre: string, opcion: string | RegExp) {
  fireEvent.keyDown(panel.getByRole("combobox", { name: nombre }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: opcion }));
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

  it("descarta el borrador móvil con Escape y conserva filtros, búsqueda y página", () => {
    const actualizarUrl = mostrarListado("?q=Mercancía&estado=Borrador&page=2", true);
    const panel = abrirPanel("Filtros 1");
    fireEvent.click(panel.getByRole("button", { name: "Limpiar" }));
    expect(panel.getByRole("combobox", { name: "Estado del embarque" })).toHaveTextContent("Todos los estados");
    expect(screen.getByTestId("pagina-listado")).toHaveTextContent("3");
    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Filtros" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar Estado: Borrador" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveValue("Mercancía");
    expect(actualizarUrl).not.toHaveBeenCalled();
  });

  it("aplica modo y operador juntos al confirmar y conserva la búsqueda y el orden", async () => {
    const actualizarUrl = mostrarListado("?q=Mercancía&estado=Borrador&page=2&sort=eta", false);
    const panel = abrirPanel("Filtros");
    await elegirFiltro(panel, "Modo de transporte", /^Marítimo/);
    await elegirFiltro(panel, "Operador", "Operador de prueba");

    expect(screen.getByTestId("pagina-listado")).toHaveTextContent("3");
    expect(actualizarUrl).not.toHaveBeenCalled();
    fireEvent.click(panel.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(actualizarUrl).toHaveBeenCalledTimes(1));
    const params = actualizarUrl.mock.calls[0][0].searchParams;
    expect(Object.fromEntries(params)).toEqual({
      q: "Mercancía", estado: "Borrador", sort: "eta", modo: "Marítimo", operador: "Operador de prueba",
    });
    expect(screen.getByTestId("pagina-listado")).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "Quitar Modo: Marítimo" })).toBeInTheDocument();
  });

  it("limpia sólo los controles del panel en escritorio", async () => {
    const actualizarUrl = mostrarListado("?q=Mercancía&estado=Borrador&cliente=cliente-qa&modo=Marítimo&page=2", false);
    const panel = abrirPanel("Filtros 1");
    fireEvent.click(panel.getByRole("button", { name: "Limpiar" }));
    expect(panel.getByRole("button", { name: "Limpiar" })).toBeDisabled();
    expect(actualizarUrl).not.toHaveBeenCalled();
    fireEvent.click(panel.getByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(actualizarUrl).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(actualizarUrl.mock.calls[0][0].searchParams)).toEqual({
      q: "Mercancía", estado: "Borrador", cliente: "cliente-qa",
    });
  });

  it("vuelve a cargar los valores aplicados al reabrir y conserva la página si no cambian", async () => {
    const actualizarUrl = mostrarListado("?page=2&modo=Marítimo", false);
    const panel = abrirPanel("Filtros 1");
    await elegirFiltro(panel, "Modo de transporte", /^Terrestre/);
    fireEvent.click(panel.getByRole("button", { name: "Cancelar" }));

    const reabierto = abrirPanel("Filtros 1");
    expect(reabierto.getByRole("combobox", { name: "Modo de transporte" })).toHaveTextContent("Marítimo");
    fireEvent.click(reabierto.getByRole("button", { name: "Aplicar" }));
    expect(screen.getByTestId("pagina-listado")).toHaveTextContent("3");
    expect(actualizarUrl).not.toHaveBeenCalled();
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

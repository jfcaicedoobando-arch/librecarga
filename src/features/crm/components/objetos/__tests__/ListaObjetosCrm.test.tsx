import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";

const { query, scoring, esMovil } = vi.hoisted(() => ({ query: vi.fn(), scoring: vi.fn(), esMovil: vi.fn() }));
vi.mock("@/features/crm/hooks/useObjetosCrm", () => ({ useListaObjetosCrm: query }));
vi.mock("@/features/crm/hooks/useScoringCrm", () => ({ usePuntajes: scoring }));
vi.mock("@/hooks/shared", () => ({ useDebounce: (v: string) => v, useIsMobile: esMovil }));
import { ListaObjetosCrm } from "../ListaObjetosCrm";

beforeEach(() => {
  vi.clearAllMocks();
  esMovil.mockReturnValue(false);
  scoring.mockReturnValue({ data: new Map() });
});
function LocationProbe() {
  const { pathname, search } = useLocation();
  return <output aria-label="Ruta actual">{pathname}{search}</output>;
}
const show = (objeto: "contacto" | "empresa" = "contacto", searchParams = "") => render(<NuqsTestingAdapter searchParams={searchParams}><MemoryRouter>
  <LocationProbe />
  <ListaObjetosCrm<{ id: string; nombre: string; correo?: string; telefono?: string }> objeto={objeto} rutaBase={`/crm/${objeto === "empresa" ? "empresas" : "contactos"}`}
    placeholder="Buscar contacto" columnas={[
      { titulo: "Nombre", celda: (f) => f.nombre },
      { titulo: "Correo", celda: (f) => f.correo ?? "—" },
      { titulo: "Teléfono", celda: (f) => f.telefono ?? "—" },
    ]} />
</MemoryRouter></NuqsTestingAdapter>);

describe("ListaObjetosCrm · tabla canónica", () => {
  it("conserva filas y navegación accesible, pagina en servidor sin ordenar una página aislada", () => {
    query.mockReturnValue({ isLoading: false, isError: false, data: { filas: [{ id: "ana", nombre: "Ana Garza" }], total: 60 } });
    show();
    expect(screen.getByRole("columnheader", { name: "Nombre" })).toBeInTheDocument();
    expect(screen.getByText("Ana Garza")).toBeInTheDocument();
    const fila = screen.getByRole("link");
    expect(fila).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(fila, { key: "Enter" });
    expect(screen.getByLabelText("Ruta actual")).toHaveTextContent("/crm/contactos/ana");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(query).toHaveBeenLastCalledWith("contacto", "", 1, "todas", "todos");
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar contacto" }), { target: { value: "Ana" } });
    expect(query).toHaveBeenLastCalledWith("contacto", "Ana", 0, "todas", "todos");
    expect(screen.queryByRole("button", { name: "Nombre" })).not.toBeInTheDocument();
  });
  it("un error permite reintentar y no presenta un vacío falso", () => {
    const refetch = vi.fn();
    query.mockReturnValue({ isLoading: false, isError: true, refetch });
    show();
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText("Aún no hay contactos registrados")).not.toBeInTheDocument();
  });
  it("una consulta exitosa sin filas sí presenta el estado vacío", () => {
    query.mockReturnValue({ isLoading: false, isError: false, data: { filas: [], total: 0 } });
    show();
    expect(screen.getByText("Aún no hay contactos registrados")).toBeInTheDocument();
  });
  it("distingue la búsqueda sin coincidencias y permite limpiar los filtros", () => {
    query.mockReturnValue({ isLoading: false, isError: false, data: { filas: [], total: 0 } });
    show();
    fireEvent.change(screen.getByRole("textbox", { name: "Buscar contacto" }), { target: { value: "Sin coincidencia" } });
    expect(screen.getByText("Sin coincidencias con estos filtros")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(query).toHaveBeenLastCalledWith("contacto", "", 0, "todas", "todos");
    expect(screen.getByText("Aún no hay contactos registrados")).toBeVisible();
  });
  it.each(["Lead", "Prospecto"])("pasa el estado %s de la URL a la consulta de empresas", (estado) => {
    query.mockReturnValue({ isLoading: false, isError: false, data: { filas: [], total: 0 } });
    show("empresa", `?estado=${estado}`);
    expect(query).toHaveBeenLastCalledWith("empresa", "", 0, "todas", estado);
    expect(screen.getByRole("combobox", { name: "Filtrar por estado" })).toHaveTextContent(estado);
  });
  it.each([false, true])("lleva la búsqueda, la página y los filtros a la ficha de empresa (móvil: %s)", (movil) => {
    esMovil.mockReturnValue(movil);
    scoring.mockReturnValue({ data: new Map([["ana", { letra: "B", puntaje: 25 }]]) });
    query.mockReturnValue({ isLoading: false, isError: false, data: { filas: [{ id: "ana", nombre: "Ana" }], total: 60 } });
    show("empresa", "?q=Ana&pagina=1&letra=A&estado=Lead");
    expect(within(screen.getByRole("link")).getByText("B · 25")).toBeVisible();
    fireEvent.keyDown(screen.getByRole("link"), { key: "Enter" });
    const ruta = screen.getByLabelText("Ruta actual").textContent ?? "";
    expect(ruta).toContain("/crm/empresas/ana?");
    expect(Object.fromEntries(new URLSearchParams(ruta.split("?")[1]))).toEqual({
      q: "Ana", pagina: "1", letra: "A", estado: "Lead",
    });
  });

  it("presenta los datos completos de contacto y conserva la paginación en tarjetas", () => {
    esMovil.mockReturnValue(true);
    const ana = { id: "ana", nombre: "Ana Garza", correo: "ana@ejemplo.test", telefono: "+52 555 555 1234" };
    query.mockReturnValue({ isLoading: false, isError: false, data: { filas: [ana], total: 60 } });
    show();
    const tarjeta = screen.getByRole("link");
    expect(tarjeta).toHaveTextContent(ana.nombre);
    expect(tarjeta).toHaveTextContent(ana.correo);
    expect(tarjeta).toHaveTextContent(ana.telefono);
    expect(within(tarjeta).queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(query).toHaveBeenLastCalledWith("contacto", "", 1, "todas", "todos");
  });

  it("no aplica el filtro de empresas al listado de contactos", () => {
    query.mockReturnValue({ isLoading: false, isError: false, data: { filas: [], total: 0 } });
    show("contacto", "?estado=Prospecto");
    expect(query).toHaveBeenLastCalledWith("contacto", "", 0, "todas", "todos");
    expect(screen.queryByRole("combobox", { name: "Filtrar por estado" })).not.toBeInTheDocument();
  });
});

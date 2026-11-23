import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { useDocumentTitle } from "@/hooks/shared";
import { useTabProformasState, type EstadoProformaControlado } from "@/features/facturacion/hooks/useTabProformasState";
import ProformasListado from "../ProformasListado";

vi.mock("@/hooks/shared", () => ({ useDocumentTitle: vi.fn(), DEFAULT_PAGE_SIZE: 25 }));
vi.mock("@/features/facturacion/components/TabProformas", () => ({
  TabProformas: ({ estadoControlado }: { estadoControlado: EstadoProformaControlado }) => {
    const filtros = useTabProformasState([], undefined, undefined, estadoControlado);
    return (
      <>
        <div data-testid="estado-activo">{filtros.filtroEstado}</div>
        <input aria-label="Buscar proformas" value={filtros.search} onChange={(e) => filtros.setSearch(e.target.value)} />
        <button onClick={() => filtros.setFiltroEstado("facturada")}>Facturadas</button>
        <button onClick={() => filtros.setFiltroEstado("todas")}>Todas</button>
      </>
    );
  },
}));

function Historial() {
  const { search } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output>{search}</output>
      <button onClick={() => void navigate(-1)}>Atrás</button>
    </>
  );
}

describe("filtro por URL del listado de proformas", () => {
  it.each(["cancelada", "aceptada", "pendiente", "rechazada", "facturada"])(
    "conserva el filtro %s al abrir el listado",
    (estado) => {
      render(<MemoryRouter initialEntries={[`/proformas?estado=${estado}`]}><ProformasListado /></MemoryRouter>);
      expect(screen.getByTestId("estado-activo")).toHaveTextContent(estado);
      expect(screen.getByRole("heading", { name: estado === "aceptada" ? "Proformas por emitir" : "Proformas" })).toBeInTheDocument();
    },
  );

  it("usa todas ante un filtro desconocido", () => {
    render(<MemoryRouter initialEntries={["/proformas?estado=desconocido"]}><ProformasListado /></MemoryRouter>);
    expect(screen.getByTestId("estado-activo")).toHaveTextContent("todas");
  });

  it("sincroniza estado y titular mientras conserva la búsqueda al navegar", () => {
    render(
      <MemoryRouter initialEntries={["/proformas?estado=aceptada&origen=menu"]}>
        <ProformasListado /><Historial />
      </MemoryRouter>,
    );
    const buscar = screen.getByRole("textbox", { name: "Buscar proformas" });
    fireEvent.change(buscar, { target: { value: "QA-100" } });
    fireEvent.click(screen.getByRole("button", { name: "Facturadas" }));
    expect(screen.getByRole("status")).toHaveTextContent("?estado=facturada&origen=menu");
    expect(screen.getByRole("heading", { name: /^Proformas$/ })).toBeVisible();
    expect(useDocumentTitle).toHaveBeenLastCalledWith("Proformas");
    expect(buscar).toHaveValue("QA-100");

    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    expect(screen.getByTestId("estado-activo")).toHaveTextContent("aceptada");
    expect(screen.getByRole("heading", { name: "Proformas por emitir" })).toBeVisible();
    expect(buscar).toHaveValue("QA-100");

    fireEvent.click(screen.getByRole("button", { name: "Todas" }));
    expect(screen.getByRole("status")).toHaveTextContent("?origen=menu");
    expect(screen.getByTestId("estado-activo")).toHaveTextContent("todas");
  });
});

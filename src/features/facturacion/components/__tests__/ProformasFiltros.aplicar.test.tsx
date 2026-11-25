import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSearchParams, MemoryRouter } from "react-router";
import ProformasFiltros from "../ProformasFiltros";
import type { ProformasFiltrosCamposProps } from "../ProformasFiltrosCampos";

vi.mock("usehooks-ts", () => ({ useMediaQuery: () => false }));
vi.mock("../ProformasFiltrosCampos", () => ({
  ProformasFiltrosCampos: ({ filtroEstado, onFiltroEstadoChange }: ProformasFiltrosCamposProps) => (
    <select aria-label="Estado de la proforma" value={filtroEstado} onChange={(e) => onFiltroEstadoChange(e.target.value)}>
      <option value="todas">Todos los estados</option>
      <option value="aceptada">Aprobada</option>
    </select>
  ),
}));

function Listado() {
  const [params, setParams] = useSearchParams();
  const estado = params.get("estado") ?? "todas";
  return (
    <>
      <output aria-label="Estado aplicado">{estado}</output>
      <ProformasFiltros search="" onSearchChange={vi.fn()} filtroEstado={estado}
        onFiltroEstadoChange={(valor) => setParams(valor === "todas" ? {} : { estado: valor })}
        filtroCliente="todos" onFiltroClienteChange={vi.fn()} filtroOperador="todos" onFiltroOperadorChange={vi.fn()}
        fechaDesde="" onFechaDesdeChange={vi.fn()} fechaHasta="" onFechaHastaChange={vi.fn()}
        clientes={[]} operadores={[]} onClearAll={vi.fn()} />
    </>
  );
}

describe("Filtros móviles de Proformas", () => {
  it("mantiene la selección como borrador y descarta al cerrar con Escape", () => {
    render(<MemoryRouter><Listado /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    const dialog = within(screen.getByRole("dialog", { name: "Filtros de proformas" }));
    fireEvent.change(dialog.getByRole("combobox"), { target: { value: "aceptada" } });
    expect(screen.getByLabelText("Estado aplicado")).toHaveTextContent("todas");
    fireEvent.keyDown(dialog.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Estado aplicado")).toHaveTextContent("todas");
    fireEvent.click(screen.getByRole("button", { name: "Filtros" }));
    expect(screen.getByRole("combobox")).toHaveValue("todas");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "aceptada" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(screen.getByLabelText("Estado aplicado")).toHaveTextContent("aceptada");
    fireEvent.click(screen.getByRole("button", { name: /^Filtros/ }));
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(screen.getByLabelText("Estado aplicado")).toHaveTextContent("aceptada");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(screen.getByLabelText("Estado aplicado")).toHaveTextContent("todas");
  });
});

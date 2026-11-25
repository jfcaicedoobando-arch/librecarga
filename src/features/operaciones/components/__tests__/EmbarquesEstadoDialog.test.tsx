import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { EmbarquesPorEstadoBucket, EstadoUiKey } from "@/features/operaciones/hooks";
import { EmbarquesEstadoDialog } from "../EmbarquesEstadoDialog";

const operador = "operador@example.test";
const bucket: EmbarquesPorEstadoBucket = {
  total: 2,
  truncated: false,
  items: ["EIR", "Cerrado"].map((estadoReal, index) => ({
    id: `embarque-${index}`, expediente: `LC-0${index + 1}`, estadoReal,
    clienteNombre: "Cliente de prueba", modo: "Marítimo", tipo: "Importación",
    origen: "", destino: "", etd: null, eta: null, diasEnPuerto: 0, diasParaEta: null,
  })),
};

function FiltrosDestino() {
  const [params] = useSearchParams();
  return <output aria-label="Filtros destino">{JSON.stringify(Object.fromEntries(params))}</output>;
}

function abrir(estado: EstadoUiKey) {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={
          <EmbarquesEstadoDialog
            open onOpenChange={vi.fn()} operador={operador} estado={estado}
            bucket={estado === "Cerrado" ? bucket : undefined}
          />
        } />
        <Route path="/embarques" element={<FiltrosDestino />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("EmbarquesEstadoDialog", () => {
  it("Finalizado muestra EIR y Cerrado y conserva sólo el filtro de operador", () => {
    abrir("Cerrado");
    expect(screen.getByRole("dialog")).toHaveAccessibleName(/Finalizado/);
    expect(screen.getByText("Incluye EIR, Por liquidar y Cerrado")).toBeInTheDocument();
    expect(screen.getByText("LC-01")).toBeInTheDocument();
    expect(screen.getByText("LC-02")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver embarques del operador" }));
    expect(screen.getByLabelText("Filtros destino")).toHaveTextContent(JSON.stringify({ operador }));
  });

  it("permite limpiar y recuperar el foco cuando la muestra no contiene la búsqueda", () => {
    render(<MemoryRouter><EmbarquesEstadoDialog open onOpenChange={vi.fn()}
      operador={operador} estado="Cerrado" bucket={{ ...bucket, total: 10, truncated: true }} /></MemoryRouter>);
    const campo = screen.getByRole("searchbox", { name: "Buscar por expediente o cliente" });
    expect(campo).toHaveAccessibleDescription(/Busca en los 2 embarques mostrados de 10/);
    fireEvent.change(campo, { target: { value: "inexistente" } });
    expect(screen.getByText("No hay coincidencias.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    expect(campo).toHaveFocus();
    expect(campo).toHaveValue("");
    expect(screen.getByText("LC-01")).toBeVisible();
  });

  it("conserva el filtro de estado en un estado individual", () => {
    abrir("Llegada");
    fireEvent.click(screen.getByRole("button", { name: "Ver todos en Embarques" }));
    expect(screen.getByLabelText("Filtros destino"))
      .toHaveTextContent(JSON.stringify({ operador, estado: "Llegada" }));
  });
});

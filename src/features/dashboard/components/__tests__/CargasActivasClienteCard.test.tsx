import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { CargasActivasClienteCard } from "../CargasActivasClienteCard";

describe("CargasActivasClienteCard", () => {
  it("indica el destino de la fila y abre la ficha con teclado", () => {
    render(
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <CargasActivasClienteCard
                data={[{
                  clienteId: "cliente-1",
                  clienteNombre: "Cliente Demo",
                  total: 3,
                  desglose: { Confirmado: 2, EIR: 1 },
                }]}
                isLoading={false}
                totalActivosGlobal={5}
              />
            }
          />
          <Route path="/clientes/cliente-1" element={<h1>Ficha de Cliente Demo</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Embarques activos por cliente" })).toBeInTheDocument();
    const fila = screen.getByRole("button", {
      name: "Abrir ficha del cliente: Cliente Demo. 2 de 5 embarques activos, 40 por ciento del total",
    });
    expect(within(fila).getByText("Abrir ficha del cliente")).toBeVisible();
    expect(within(fila).getByText("2 Confirmado")).toBeVisible();

    fireEvent.keyDown(fila, { key: "Enter" });

    expect(screen.getByRole("heading", { name: "Ficha de Cliente Demo" })).toBeInTheDocument();
  });
});

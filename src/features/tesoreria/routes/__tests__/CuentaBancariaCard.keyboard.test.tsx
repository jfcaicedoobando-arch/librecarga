import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { CuentaBancariaCard } from "../_sections/CuentaBancariaCard";

function CurrentRoute() {
  const { pathname } = useLocation();
  return <output>{pathname}</output>;
}

describe("Cuenta bancaria", () => {
  it("preserva las acciones de los botones internos al usar el teclado", () => {
    const editar = vi.fn();
    const cuenta = {
      id: "cuenta-1", alias: "Operativa", banco: "Banco", moneda: "MXN",
      numero_cuenta: null, clabe: null, saldo_inicial: 0, fecha_saldo_inicial: "2026-11-23", activa: true,
    };
    render(
      <MemoryRouter initialEntries={["/tesoreria/cuentas"]}>
        <CurrentRoute />
        <CuentaBancariaCard cuenta={cuenta} canAdmin onEditar={editar} onEliminar={vi.fn()} />
      </MemoryRouter>,
    );

    const editarCuenta = screen.getByRole("button", { name: "Editar cuenta Operativa" });
    expect(fireEvent.keyDown(editarCuenta, { key: " " })).toBe(true);
    fireEvent.click(editarCuenta);
    expect(editar).toHaveBeenCalledWith(cuenta);
    expect(screen.getByText("/tesoreria/cuentas")).toBeInTheDocument();

    const conciliacion = screen.getByRole("link", { name: "Ver conciliación de Operativa" });
    expect(conciliacion).toHaveAttribute("href", "/tesoreria/conciliacion?cuenta=cuenta-1");
    fireEvent.click(conciliacion);
    expect(screen.getByText("/tesoreria/conciliacion")).toBeInTheDocument();

    const estadoCuenta = screen.getByRole("link", { name: "Ver estado de cuenta de Operativa" });
    expect(fireEvent.keyDown(estadoCuenta, { key: "Enter" })).toBe(true);
    fireEvent.click(estadoCuenta);
    expect(screen.getByText("/tesoreria/estado-cuenta")).toBeInTheDocument();
  });
});

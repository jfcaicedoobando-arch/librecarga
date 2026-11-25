import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
const mock = vi.hoisted(() => ({ cuentas: vi.fn(), permisos: vi.fn(), estado: vi.fn() }));
vi.mock("@/features/tesoreria/hooks", () => ({ useCuentasBancarias: mock.cuentas }));
vi.mock("@/hooks/shared/usePermissions", () => ({ usePermissions: mock.permisos }));
vi.mock("@/features/tesoreria/hooks/useEstadoCuenta", () => ({
  useEstadoCuenta: mock.estado,
}));
vi.mock("@/features/tesoreria/components/DetallePagoSheet", () => ({ DetallePagoSheet: () => null }));
import TesoreriaEstadoCuenta from "../TesoreriaEstadoCuenta";

describe("N03/N04 · estado de cuenta sin cuentas", () => {
  beforeEach(() => {
    document.title = "Iniciar sesión · Libre Carga";
    mock.permisos.mockReturnValue({ canAdminCuentasBancarias: false });
    mock.estado.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    mock.cuentas.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: vi.fn() });
  });
  const abrir = () => render(<MemoryRouter><TesoreriaEstadoCuenta /></MemoryRouter>);
  it("explica la configuración faltante al contador, sin abrir un selector vacío", () => {
    abrir();
    expect(screen.getByText(/No hay cuentas bancarias activas/i)).toBeInTheDocument();
    expect(screen.getByText(/Solicita a un administrador/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Cuenta bancaria" })).toBeNull();
    expect(document.title).toBe("Estado de cuenta · Libre Carga");
  });
  it("no confunde un error de carga con una lista vacía", () => {
    mock.cuentas.mockReturnValue({ data: [], isLoading: false, isError: true, refetch: vi.fn() });
    abrir();
    expect(screen.getByText(/No se pudieron cargar las cuentas bancarias/i)).toBeInTheDocument();
    expect(screen.queryByText(/No hay cuentas bancarias activas/i)).toBeNull();
  });
  it("muestra un solo error del extracto, recuperando la cuenta y las fechas elegidas", () => {
    mock.cuentas.mockReturnValue({
      data: [{ id: "c1", alias: "BBVA MXN", banco: "BBVA", moneda: "MXN" }],
      isLoading: false,
      isError: false,
    });
    const refetch = vi.fn();
    mock.estado.mockReturnValue({ isError: true, isLoading: false, refetch });
    const pagina = <MemoryRouter initialEntries={["/tesoreria/estado-cuenta?cuenta=c1"]}><TesoreriaEstadoCuenta /></MemoryRouter>;
    const { rerender } = render(pagina);
    const consulta = mock.estado.mock.lastCall;
    expect(consulta?.[0]).toBe("c1");
    expect(screen.getByText("No se pudo cargar el estado de cuenta")).toBeInTheDocument();
    expect(screen.queryByText(/0 de 0 movimientos/)).not.toBeInTheDocument();
    expect(screen.queryByText("Saldo inicial")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();

    mock.estado.mockReturnValue({
      data: {
        cuenta_id: "c1", alias: "BBVA MXN", banco: "BBVA", moneda: "MXN",
        desde: consulta?.[1], hasta: consulta?.[2], cobertura_historica: "completa",
        saldo_inicial: 0, saldo_final: 0, total_entradas: 0, total_salidas: 0,
        movimientos_previos_corte: 0, movimientos: [],
      },
      isLoading: false,
      isError: false,
    });
    rerender(<MemoryRouter initialEntries={["/tesoreria/estado-cuenta?cuenta=c1"]}><TesoreriaEstadoCuenta /></MemoryRouter>);
    expect(mock.estado.mock.lastCall).toEqual(consulta);
    expect(screen.queryByText("No se pudo cargar el estado de cuenta")).not.toBeInTheDocument();
    expect(screen.getByText(/0 de 0 movimientos/)).toBeInTheDocument();
  });

  it("permite seleccionar otra cuenta si no está disponible la de un enlace guardado", () => {
    mock.cuentas.mockReturnValue({
      data: [{ id: "c1", alias: "BBVA MXN", banco: "BBVA", moneda: "MXN" }],
      isLoading: false,
      isError: false,
    });
    render(<MemoryRouter initialEntries={["/tesoreria/estado-cuenta?cuenta=cerrada"]}><TesoreriaEstadoCuenta /></MemoryRouter>);
    expect(screen.getByText("Esta cuenta ya no está disponible. Selecciona otra.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Cuenta bancaria" })).toBeEnabled();
    expect(mock.estado.mock.lastCall?.[0]).toBeNull();
  });

  it("limpia búsqueda y tipo cuando ninguna fila coincide, preservando cuenta y periodo", () => {
    mock.cuentas.mockReturnValue({ data: [{ id: "c1", alias: "BBVA MXN", banco: "BBVA", moneda: "MXN" }] });
    mock.estado.mockReturnValue({
      data: {
        cuenta_id: "c1", alias: "BBVA MXN", banco: "BBVA", moneda: "MXN",
        desde: "2026-11-01", hasta: "2026-11-30", cobertura_historica: "completa",
        saldo_inicial: 0, saldo_final: 100, total_entradas: 100, total_salidas: 0,
        movimientos_previos_corte: 0, movimientos: [
          { id: "m1", fecha: "2026-11-04", concepto: "Cobro de flete", referencia: "Ref 1", cargo: 0, abono: 100, saldo_corrido: 100 },
        ],
      },
      isLoading: false,
      isError: false,
    });
    render(<MemoryRouter initialEntries={["/tesoreria/estado-cuenta?cuenta=c1"]}><TesoreriaEstadoCuenta /></MemoryRouter>);
    const consulta = mock.estado.mock.lastCall;
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar por concepto o referencia" }), { target: { value: "sin coincidencias" } });
    expect(screen.getByText("Ningún movimiento coincide con los filtros.")).toBeInTheDocument();
    expect(screen.queryByText("No hay movimientos en el periodo seleccionado.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda y tipo" }));
    expect(screen.getByText("Cobro de flete")).toBeInTheDocument();
    expect(mock.estado.mock.lastCall).toEqual(consulta);
  });

  it("cuando sí existen cuentas sin seleccionar, muestra el selector y el mensaje correcto", () => {
    mock.cuentas.mockReturnValue({ data: [{ id: "c1", alias: "BBVA MXN", banco: "BBVA", moneda: "MXN" }], isLoading: false, isError: false, refetch: vi.fn() });
    abrir();
    expect(screen.getByRole("combobox", { name: "Cuenta bancaria" })).not.toBeDisabled();
    expect(screen.getByText(/Selecciona una cuenta para ver su estado de cuenta/i)).toBeInTheDocument();
  });
});

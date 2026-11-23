import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalFacturaPagosCard from "../PortalFacturaPagosCard";

const { pagos, notas, saldo } = vi.hoisted(() => ({ pagos: vi.fn(), notas: vi.fn(), saldo: vi.fn() }));
vi.mock("@/features/portal/hooks", () => ({
  usePortalPagosFactura: pagos,
  usePortalNotasCreditoFactura: notas,
  usePortalResumenSaldoFactura: saldo,
}));

const props = { facturaId: "factura-qa", totalFactura: 123, moneda: "MXN" };
const consulta = { isLoading: false, isError: false, isFetching: false };
const reintentarPagos = vi.fn();
const reintentarNotas = vi.fn();
const reintentarSaldo = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  pagos.mockReturnValue({ ...consulta, data: [], refetch: reintentarPagos });
  notas.mockReturnValue({ ...consulta, data: [], refetch: reintentarNotas });
  saldo.mockReturnValue({ ...consulta, data: { saldo: 0, pagado: 123, notasCredito: 0 }, refetch: reintentarSaldo });
});

describe("PortalFacturaPagosCard", () => {
  it("muestra saldo desconocido tras el error y saldo cero cuando se confirma", () => {
    saldo.mockReturnValue({ ...consulta, isError: true, refetch: reintentarSaldo });
    const vista = render(<PortalFacturaPagosCard {...props} />);
    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent("Saldo no disponible");
    expect(screen.getByText("Saldo").nextElementSibling).toHaveTextContent("No disponible");
    fireEvent.click(within(aviso).getByRole("button", { name: "Reintentar" }));
    expect(reintentarSaldo).toHaveBeenCalledOnce();
    expect(reintentarPagos).not.toHaveBeenCalled();

    saldo.mockReturnValue({ ...consulta, data: { saldo: 0, pagado: 123, liquidada: true } });
    vista.rerender(<PortalFacturaPagosCard {...props} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Saldo").nextElementSibling).toHaveTextContent("0.00");
  });

  it("distingue los fallos de las listas sin ocultar el saldo confirmado", () => {
    pagos.mockReturnValue({ ...consulta, isError: true, refetch: reintentarPagos });
    notas.mockReturnValue({ ...consulta, isError: true, refetch: reintentarNotas });
    render(<PortalFacturaPagosCard {...props} />);
    const [avisoPagos, avisoNotas] = screen.getAllByRole("alert");
    expect(avisoPagos).toHaveTextContent("No pudimos consultar los pagos");
    expect(avisoNotas).toHaveTextContent("No pudimos consultar las notas de crédito");
    expect(screen.queryByText(/Aún no se han registrado pagos/)).toBeNull();
    fireEvent.click(within(avisoNotas).getByRole("button", { name: "Reintentar" }));
    expect(reintentarNotas).toHaveBeenCalledOnce();
    expect(reintentarPagos).not.toHaveBeenCalled();
    expect(screen.getByText("Saldo").nextElementSibling).toHaveTextContent("0.00");
  });

  it.each(["Pagada", "Cancelada"])("conserva el saldo terminal de una factura %s", (estadoFactura) => {
    saldo.mockReturnValue({ ...consulta, data: null, refetch: reintentarSaldo });
    render(<PortalFacturaPagosCard {...props} estadoFactura={estadoFactura} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Resumen de movimientos no disponible");
    expect(screen.getByText("Saldo").nextElementSibling).toHaveTextContent("0.00");
  });
});

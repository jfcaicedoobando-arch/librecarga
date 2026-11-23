import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TabGarantias } from "../TabGarantias";
import { TabTracking } from "../TabTracking";
import { VerificacionMontoEntrante } from "../entrantes/VerificacionMontoEntrante";

const { contenedores, eventos, garantias } = vi.hoisted(() => ({
  contenedores: vi.fn(),
  eventos: vi.fn(),
  garantias: vi.fn(),
}));

vi.mock("@/features/embarques/hooks", () => ({
  useContenedoresEmbarque: contenedores,
  useEventosEmbarque: eventos,
}));
vi.mock("@/features/embarques/hooks/useGarantiasContenedor", () => ({
  useGarantiasContenedor: garantias,
  useRefrescarGarantiasDesdeTarifa: () => ({ isPending: false }),
}));
vi.mock("@/features/embarques/hooks/useGarantiasColumns", () => ({
  useGarantiasColumns: () => ({ columns: [] }),
}));
vi.mock("@/hooks/shared", () => ({
  usePermissions: () => ({ canEdit: false }),
}));
vi.mock("../tracking/TrackingNuevoEventoForm", () => ({
  TrackingNuevoEventoForm: () => null,
}));
vi.mock("../tracking/TrackingNavieraActions", () => ({
  TrackingNavieraActions: () => null,
}));

it("reintenta garantías y contenedores por separado", () => {
  const reintentarGarantias = vi.fn();
  const reintentarContenedores = vi.fn();
  garantias.mockReturnValue({ isError: true, refetch: reintentarGarantias });
  contenedores.mockReturnValue({ isError: true, refetch: reintentarContenedores });
  const view = render(<TabGarantias embarqueId="emb" canEdit={false} />);

  expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron consultar las garantías");
  expect(screen.queryByText("Sin garantías registradas")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(reintentarGarantias).toHaveBeenCalledOnce();

  garantias.mockReturnValue({ data: [] });
  view.rerender(<TabGarantias embarqueId="emb" canEdit={false} />);
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron consultar los contenedores");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(reintentarContenedores).toHaveBeenCalledOnce();
});

it("conserva la sección de tracking y reintenta sus eventos", () => {
  const refetch = vi.fn();
  eventos.mockReturnValue({ isError: true, refetch });
  render(<TabTracking embarqueId="emb" />);

  expect(screen.getByText("Línea de tiempo")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudo consultar la línea de tiempo");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(refetch).toHaveBeenCalledOnce();
});

it("reintenta un cotejo fallido sin perder el monto de la factura", () => {
  const reintentarCostos = vi.fn();
  render(<VerificacionMontoEntrante
    monto={100}
    moneda="MXN"
    onMonto={vi.fn()}
    onMoneda={vi.fn()}
    totalCfdi={100}
    costeadoPorMoneda={undefined}
    cargandoCostos={false}
    errorCostos
    proveedorElegido
    reintentarCostos={reintentarCostos}
  />);

  expect(screen.getByRole("alert")).toHaveTextContent("No pudimos verificar los costos del proveedor");
  expect(screen.queryByText(/No hay costos comparables/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(reintentarCostos).toHaveBeenCalledOnce();
  expect(screen.getByLabelText(/Monto de la factura/)).toHaveValue("100");
});

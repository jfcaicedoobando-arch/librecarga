import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MarcarCapturadaDialog } from "../MarcarCapturadaDialog";

const consulta = vi.hoisted(() => ({ fallida: true, refetch: vi.fn() }));
vi.mock("@/features/cxp/hooks", () => ({
  useFacturasVinculablesEntrante: () => ({
    data: consulta.fallida ? undefined : [{ id: "factura-local", folio_interno: "FP-010", total: 250, moneda: "MXN" }],
    isLoading: false, isError: consulta.fallida, isFetching: false, refetch: consulta.refetch,
  }),
}));

it("distingue una falla de consulta y recupera las candidatas sin confirmar el marcado", async () => {
  const props = { open: true, onOpenChange: vi.fn(), onConfirm: vi.fn(), pendiente: false, embarqueId: "embarque-local" };
  const { rerender } = render(<MarcarCapturadaDialog {...props} />);
  expect(screen.getByText("No se pudieron consultar las facturas del embarque")).toBeInTheDocument();
  expect(screen.queryByText(/todavía no tiene facturas/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Marcar como capturada" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(consulta.refetch).toHaveBeenCalledOnce();
  consulta.fallida = false;
  rerender(<MarcarCapturadaDialog {...props} />);
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Selecciona la factura capturada" }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: /FP-010/ }));
  expect(screen.getByRole("button", { name: "Marcar como capturada" })).toBeEnabled();
  expect(props.onConfirm).not.toHaveBeenCalled();
});

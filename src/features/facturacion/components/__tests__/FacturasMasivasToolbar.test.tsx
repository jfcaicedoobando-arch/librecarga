import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FacturasMasivasToolbar } from "../FacturasMasivasToolbar";

const acciones = vi.hoisted(() => ({ reenviar: vi.fn(), marcar: vi.fn() }));
vi.mock("../../hooks/useFacturasMasivas", () => ({
  useFacturasMasivas: () => ({
    busy: null,
    progreso: null,
    descargarZip: vi.fn(),
    reenviarEmail: acciones.reenviar,
    marcarEnviada: acciones.marcar,
  }),
}));

it("muestra las acciones de lote únicamente cuando hay una selección", () => {
  const props = { onClear: vi.fn(), onMarked: vi.fn(), visibleIds: new Set(["f-1"]) };
  const { rerender } = render(<FacturasMasivasToolbar selectedIds={new Set()} {...props} />);
  expect(screen.queryByRole("group", { name: "Acciones sobre facturas seleccionadas" })).not.toBeInTheDocument();
  rerender(<FacturasMasivasToolbar selectedIds={new Set(["f-1"])} {...props} />);
  expect(screen.getByRole("group", { name: "Acciones sobre facturas seleccionadas" }))
    .toHaveTextContent("1 seleccionada");
  fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
  expect(props.onClear).toHaveBeenCalledOnce();
});

it("advierte de las filas fuera de página y ofrece confirmarlas o conservar solo las visibles", async () => {
  const onMarked = vi.fn();
  render(<FacturasMasivasToolbar selectedIds={new Set(["f-1", "f-2"])} visibleIds={new Set(["f-1"])}
    onClear={vi.fn()} onMarked={onMarked} />);
  expect(screen.getByRole("status")).toHaveTextContent("2 seleccionadas · 1 fuera de esta página");
  fireEvent.click(screen.getByRole("button", { name: "Conservar solo las visibles" }));
  expect(onMarked).toHaveBeenCalledWith(["f-2"]);
  fireEvent.click(screen.getByRole("button", { name: "Marcar enviada" }));
  expect(acciones.marcar).not.toHaveBeenCalled();
  expect(screen.getByRole("alertdialog")).toHaveTextContent("1 fuera de esta página");
  fireEvent.click(screen.getByRole("button", { name: "Marcar enviadas" }));
  expect(acciones.marcar).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Reenviar por email" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("1 fuera de esta página");
  expect(acciones.reenviar).not.toHaveBeenCalled();
});

it("pide volver a abrir la confirmación cuando cambia la selección", () => {
  const props = { onClear: vi.fn(), onMarked: vi.fn(), visibleIds: new Set(["f-1"]) };
  const { rerender } = render(<FacturasMasivasToolbar selectedIds={new Set(["f-1"])} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Reenviar por email" }));
  expect(screen.getByRole("button", { name: "Reenviar" })).toBeEnabled();
  rerender(<FacturasMasivasToolbar selectedIds={new Set(["f-2"])} {...props} />);
  expect(screen.getByRole("button", { name: "Reenviar" })).toBeDisabled();
});

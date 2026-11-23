import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FacturasMasivasToolbar } from "../FacturasMasivasToolbar";

vi.mock("../../hooks/useFacturasMasivas", () => ({
  useFacturasMasivas: () => ({
    busy: null,
    progreso: null,
    descargarZip: vi.fn(),
    reenviarEmail: vi.fn(),
    marcarEnviada: vi.fn(),
  }),
}));

it("muestra las acciones de lote únicamente cuando hay una selección", () => {
  const props = { onClear: vi.fn(), onMarked: vi.fn() };
  const { rerender } = render(<FacturasMasivasToolbar selectedIds={new Set()} {...props} />);
  expect(screen.queryByRole("group", { name: "Acciones sobre facturas seleccionadas" })).not.toBeInTheDocument();
  rerender(<FacturasMasivasToolbar selectedIds={new Set(["f-1"])} {...props} />);
  expect(screen.getByRole("group", { name: "Acciones sobre facturas seleccionadas" }))
    .toHaveTextContent("1 seleccionada");
  fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
  expect(props.onClear).toHaveBeenCalledOnce();
});

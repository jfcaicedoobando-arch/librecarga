import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ReporteEditorDialog } from "../ReporteEditorDialog";

vi.mock("@/features/crm/hooks/useEtapasPipeline", () => ({ useEtapasPipeline: () => ({ data: [] }) }));

it("impide guardar fechas invertidas y permite fechas iguales", () => {
  const guardar = vi.fn();
  render(<ReporteEditorDialog open onOpenChange={vi.fn()} guardando={false} onGuardar={guardar} />);
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Reporte" } });
  fireEvent.change(screen.getByLabelText(/Creados desde/), { target: { value: "2026-11-12" } });
  fireEvent.change(screen.getByLabelText(/Creados hasta/), { target: { value: "2026-11-11" } });
  const boton = screen.getByRole("button", { name: "Guardar reporte" });
  expect(boton).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("La fecha inicial debe ser anterior o igual a la final.");
  fireEvent.click(boton);
  expect(guardar).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText(/Creados hasta/), { target: { value: "2026-11-12" } });
  fireEvent.click(boton);
  expect(guardar).toHaveBeenCalledWith(expect.objectContaining({
    filtro: expect.objectContaining({ desde: "2026-11-12", hasta: "2026-11-12" }),
  }));
});

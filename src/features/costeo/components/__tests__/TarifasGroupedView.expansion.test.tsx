import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TarifasGroupedView } from "../TarifasGroupedView";

vi.mock("../../hooks/useAprobacionTarifa", () => ({
  useAprobacionTarifa: () => ({ aprobar: {}, rechazar: {}, reactivar: {} }),
}));
vi.mock("../TarifaFila", () => ({ TarifaFila: () => <p>Tarifa de prueba</p>, TarifaColumnHeader: () => null }));
vi.mock("../DialogRechazarTarifa", () => ({ DialogRechazarTarifa: () => null }));

function grupos(origenes: string[]) {
  return origenes.map((origen) => ({
    id: origen,
    ruta_id: origen,
    tipo_contenedor_id: "tipo",
    puerto_origen_nombre: origen,
    puerto_destino_nombre: "Destino QA",
    tipo_contenedor_nombre: "20 GP",
    vigente_desde: "2020-01-01",
    vigente_hasta: "2020-01-02",
    total_comparable: 10,
  })) as Parameters<typeof TarifasGroupedView>[0]["tarifas"];
}

const acciones = { onEditar: vi.fn(), onDuplicar: vi.fn(), onEliminar: vi.fn() };

describe("Expansión de tarifas agrupadas", () => {
  it("al filtrar calcula el botón masivo con los grupos visibles", () => {
    const vista = render(<TarifasGroupedView tarifas={grupos(["Origen A", "Origen B"])} {...acciones} />);
    fireEvent.click(screen.getByRole("button", { name: "Colapsar todos" }));
    expect(screen.getByRole("button", { name: /Origen A/ })).toHaveAttribute("aria-expanded", "false");

    vista.rerender(<TarifasGroupedView tarifas={grupos(["Origen C", "Origen D"])} {...acciones} />);
    expect(screen.getByRole("button", { name: "Colapsar todos" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Origen C/ })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Colapsar todos" }));
    expect(screen.getByRole("button", { name: "Expandir todos" })).toBeVisible();
  });
});

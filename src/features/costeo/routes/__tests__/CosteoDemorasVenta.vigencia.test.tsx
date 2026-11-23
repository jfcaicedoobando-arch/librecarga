import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CosteoDemorasVenta from "../CosteoDemorasVenta";

const { crear } = vi.hoisted(() => ({ crear: vi.fn() }));

vi.mock("@/features/costeo/hooks/useDemorasVenta", () => ({
  useDemorasVenta: () => ({ data: [], isLoading: false, isError: false }),
  useDemorasVentaMutations: () => ({
    crear: { mutateAsync: crear, isPending: false },
    eliminar: { isPending: false },
  }),
}));

vi.mock("@/features/catalogos/hooks", () => ({
  useTiposContenedor: () => ({ data: [{ id: "20", code: "20DV", name: "20 pies" }] }),
}));

async function abrirNuevaTarifa() {
  render(<CosteoDemorasVenta />);
  fireEvent.click(screen.getByRole("button", { name: "Nueva tarifa" }));
  fireEvent.keyDown(screen.getByRole("combobox", { name: /Tipo de contenedor/ }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("option", { name: "20DV" }));
  return {
    desde: screen.getByRole("textbox", { name: /Vigencia desde/ }),
    hasta: screen.getByRole("textbox", { name: "Vigencia hasta" }),
    guardar: screen.getByRole("button", { name: "Guardar" }),
  };
}

beforeEach(() => crear.mockResolvedValue(undefined));

describe("Vigencia de tarifa de venta de demoras", () => {
  it("impide guardar un rango invertido y permite corregirlo al mismo día", async () => {
    const { desde, hasta, guardar } = await abrirNuevaTarifa();
    fireEvent.change(desde, { target: { value: "20/03/2026" } });
    fireEvent.change(hasta, { target: { value: "19/03/2026" } });

    expect(hasta).toHaveAttribute("aria-invalid", "true");
    expect(hasta).toHaveAccessibleDescription("El fin debe ser igual o posterior al inicio de la vigencia.");
    expect(guardar).toBeDisabled();
    fireEvent.submit(hasta.closest("form")!);
    expect(crear).not.toHaveBeenCalled();

    fireEvent.change(hasta, { target: { value: "20/03/2026" } });
    expect(hasta).not.toHaveAttribute("aria-invalid");
    expect(guardar).toBeEnabled();
    fireEvent.click(guardar);
    await waitFor(() => expect(crear).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      vigente_desde: "2026-03-20", vigente_hasta: "2026-03-20",
    })));
  });

  it("requiere el inicio y guarda una tarifa sin fin cuando se corrige", async () => {
    const { desde, guardar } = await abrirNuevaTarifa();
    fireEvent.change(desde, { target: { value: "" } });
    expect(desde).toHaveAttribute("aria-invalid", "true");
    expect(desde).toHaveAccessibleDescription("Captura el inicio de la vigencia.");
    expect(guardar).toBeDisabled();
    fireEvent.submit(desde.closest("form")!);
    expect(crear).not.toHaveBeenCalled();

    fireEvent.change(desde, { target: { value: "20/03/2026" } });
    expect(desde).not.toHaveAttribute("aria-invalid");
    expect(guardar).toBeEnabled();
    fireEvent.click(guardar);
    await waitFor(() => expect(crear).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      vigente_desde: "2026-03-20", vigente_hasta: null,
    })));
  });
});

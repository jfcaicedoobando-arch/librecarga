/**
 * P1 — el selector debe permanecer controlado (value siempre string) y mostrar
 * el nombre canónico incluso cuando el ID guardado es un duplicado legacy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

const LEGACY_HC = "99999999-9999-9999-9999-999999999999";
const TIPO_HC = {
  id: "33333333-3333-3333-3333-333333333333",
  name: "40' High Cube",
  code: "40HC",
  idsEquivalentes: ["33333333-3333-3333-3333-333333333333", LEGACY_HC],
};
const TIPO_DRY = {
  id: "44444444-4444-4444-4444-444444444444",
  name: "20' Dry",
  code: "20DV",
  idsEquivalentes: ["44444444-4444-4444-4444-444444444444"],
};

const { useTiposContenedor } = vi.hoisted(() => ({ useTiposContenedor: vi.fn() }));

vi.mock("@/features/catalogos/hooks", () => ({ useTiposContenedor }));

import { TipoContenedorSelect } from "../TipoContenedorSelect";

function Campo({ value }: { value: string }) {
  return (
    <>
      <label htmlFor="t">Tipo contenedor</label>
      <TipoContenedorSelect id="t" value={value} onChange={onChange} />
    </>
  );
}

const onChange = vi.fn();
beforeEach(() => {
  onChange.mockReset();
  useTiposContenedor.mockReset();
  useTiposContenedor.mockReturnValue({ data: [TIPO_DRY, TIPO_HC] });
});

describe("TipoContenedorSelect", () => {
  it("muestra el placeholder cuando el valor es vacío", () => {
    render(<Campo value="" />);
    expect(screen.getByLabelText("Tipo contenedor")).toHaveTextContent("Selecciona");
  });

  it("distingue carga, error y catálogo vacío sin reemplazar el valor guardado", () => {
    const refetch = vi.fn();
    useTiposContenedor.mockReturnValue({ isLoading: true });
    const { rerender } = render(<Campo value={LEGACY_HC} />);
    const selector = screen.getByLabelText("Tipo contenedor");

    expect(selector).toBeDisabled();
    expect(selector).toHaveTextContent("Tipo de contenedor guardado");
    expect(selector).toHaveAccessibleDescription("Cargando tipos de contenedor…");

    useTiposContenedor.mockReturnValue({ isError: true, refetch });
    rerender(<Campo value={LEGACY_HC} />);
    expect(selector).toHaveAccessibleDescription("No se pudo consultar el catálogo de tipos de contenedor.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();

    useTiposContenedor.mockReturnValue({ data: [] });
    rerender(<Campo value={LEGACY_HC} />);
    expect(selector).toHaveAccessibleDescription("No hay tipos de contenedor disponibles. Consulta al responsable de Catálogos.");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("muestra el nombre canónico cuando el valor es un duplicado legacy", () => {
    render(<Campo value={LEGACY_HC} />);
    expect(screen.getByLabelText("Tipo contenedor")).toHaveTextContent("40' High Cube");
  });

  it("selecciona con mouse y emite el ID canónico", async () => {
    render(<Campo value="" />);
    fireEvent.click(screen.getByLabelText("Tipo contenedor"));
    const lista = within(await screen.findByRole("listbox"));
    fireEvent.click(lista.getByText("40' High Cube"));
    expect(onChange).toHaveBeenCalledWith(TIPO_HC.id);
  });

  it("selecciona con teclado y emite el ID canónico", async () => {
    render(<Campo value="" />);
    const trigger = screen.getByLabelText("Tipo contenedor");
    fireEvent.keyDown(trigger, { key: "Enter" });
    const listbox = await screen.findByRole("listbox");
    const opciones = within(listbox).getAllByRole("option");
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(opciones[1], { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(TIPO_HC.id);
  });
});

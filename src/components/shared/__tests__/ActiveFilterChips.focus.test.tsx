import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it } from "vitest";
import { ActiveFilterChips } from "../ActiveFilterChips";

function Filtros() {
  const [labels, setLabels] = useState(["Moneda", "Fecha"]);
  return (
    <>
      <input id="busqueda" aria-label="Buscar" />
      <ActiveFilterChips searchId="busqueda" onClearAll={() => setLabels([])}
        chips={labels.map((label) => ({
          key: label, label, onRemove: () => setLabels((current) => current.filter((item) => item !== label)),
        }))} />
    </>
  );
}

it("enfoca el chip siguiente o devuelve el foco a búsqueda si era el último", async () => {
  render(<Filtros />);
  fireEvent.click(screen.getByRole("button", { name: "Quitar filtro Moneda" }));
  const siguiente = screen.getByRole("button", { name: "Quitar filtro Fecha" });
  await waitFor(() => expect(siguiente).toHaveFocus());
  fireEvent.click(siguiente);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Buscar" })).toHaveFocus());
});

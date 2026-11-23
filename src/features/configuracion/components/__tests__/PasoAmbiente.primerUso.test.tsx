import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { PasoAmbiente } from "../wizard/PasoAmbiente";
import type { FacturapiAmbiente } from "../../services/facturapiCredenciales";

function Seleccion() {
  const [ambiente, setAmbiente] = useState<FacturapiAmbiente>("sandbox");
  return <PasoAmbiente ambiente={ambiente} onChange={setAmbiente} />;
}

it("expone los dos ambientes y su selección por nombre", () => {
  render(<Seleccion />);
  const sandbox = screen.getByRole("radio", { name: "Sandbox (pruebas)" });
  const produccion = screen.getByRole("radio", { name: /Producción/ });
  expect(sandbox).toBeChecked();
  fireEvent.click(produccion);
  expect(produccion).toBeChecked();
  expect(sandbox).not.toBeChecked();
});

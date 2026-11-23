import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DialogAceptarCotizacion } from "../DialogAceptarCotizacion";

it.each([true, false])("explica el borrador y la confirmación de Operaciones con oportunidad: %s", (tieneOportunidad) => {
  render(<DialogAceptarCotizacion
    open onOpenChange={vi.fn()} onConfirmar={vi.fn()} enviando={false} cargandoMoneda={false}
    tieneOportunidad={tieneOportunidad} hayChoqueMoneda={false} monedaCotizacion="USD" monedaOportunidad="USD"
  />);
  const dialogo = screen.getByRole("alertdialog");
  expect(dialogo).toHaveAccessibleDescription(/Si se genera un embarque automáticamente.*borrador.*Operaciones lo revise y confirme/);
  expect(dialogo).toHaveTextContent("un usuario autorizado podrá crearlo");
  expect(dialogo.textContent?.includes("oportunidad se cerrará como Ganada")).toBe(tieneOportunidad);
});

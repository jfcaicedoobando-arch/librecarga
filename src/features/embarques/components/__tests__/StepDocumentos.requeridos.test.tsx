import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { StepDocumentos } from "../StepDocumentos";

it("cuenta los opcionales como adjuntos posibles y advierte sólo si falta un requerido", () => {
  const opcional = { nombre: "Carta adicional", adjuntado: false, requerido: false };
  const requerido = { nombre: "BL Master", adjuntado: true };
  const onFileChange = vi.fn();
  const { rerender } = render(<StepDocumentos documentos={[requerido, opcional]} onFileChange={onFileChange} />);
  expect(screen.getByText("1 de 2 adjuntos")).toBeVisible();
  expect(screen.queryByText("Documentos requeridos pendientes")).not.toBeInTheDocument();
  rerender(<StepDocumentos documentos={[{ ...requerido, adjuntado: false }, opcional]} onFileChange={onFileChange} />);
  expect(screen.getByText(/Documentos requeridos pendientes: 1 de 1/)).toBeVisible();
});

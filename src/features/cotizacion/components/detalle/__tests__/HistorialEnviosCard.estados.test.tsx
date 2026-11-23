import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { HistorialEnviosCard, type HistorialEnviosProps } from "../HistorialEnviosCard";

const envio = {
  id: "envio-demo", estado: "enviado", created_at: "2026-11-23T15:30:00Z", enviado_por: null,
  destinatarios: [{ email: "contacto@ejemplo.test" }], cc: [], asunto: null, mensaje: null,
  error: null, pdf_link_publico: null, pdf_storage_path: null,
};

it("muestra carga, error reintentable y resultados del historial sin enviar correo", () => {
  const base: HistorialEnviosProps = {
    envios: [], isLoading: false, isError: false, isFetching: false, onRetry: vi.fn(),
  };
  const { rerender } = render(<HistorialEnviosCard {...base} isLoading />);
  expect(screen.getByText("Consultando historial de envíos…")).toBeVisible();
  rerender(<HistorialEnviosCard {...base} isError />);
  expect(screen.getByRole("alert")).toHaveTextContent("No pudimos consultar el historial de envíos");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(base.onRetry).toHaveBeenCalledOnce();
  rerender(<HistorialEnviosCard {...base} envios={[envio]} isError />);
  expect(screen.getByText(/contacto@ejemplo.test/)).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("Mostramos los últimos envíos consultados.");
  rerender(<HistorialEnviosCard {...base} envios={[envio]} />);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText(/contacto@ejemplo.test/)).toBeVisible();
});

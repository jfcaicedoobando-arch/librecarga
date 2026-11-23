import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { fetchContactosClienteEnvio } from "@/features/facturacion/services/contactosClienteEnvio";
import { DialogEnviarCfdi } from "../DialogEnviarCfdi";

vi.mock("@/features/facturacion/services/contactosClienteEnvio", () => ({
  fetchContactosClienteEnvio: vi.fn(),
}));

it("ofrece reintentar la libreta sin ocultar contactos válidos ni borrar el correo capturado", async () => {
  const contacto = {
    id: "contacto-1", nombre: "Compras", email: "compras@example.test",
    tipo: "Facturación", esFacturacion: true,
  };
  vi.mocked(fetchContactosClienteEnvio)
    .mockResolvedValueOnce({
      contactos: [contacto], emailCliente: null, emailSugerido: contacto.email, consultaIncompleta: true,
    })
    .mockResolvedValueOnce({
      contactos: [contacto], emailCliente: "principal@example.test",
      emailSugerido: contacto.email, consultaIncompleta: false,
    });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <DialogEnviarCfdi open onOpenChange={vi.fn()} facturaId="factura-1" clienteId="cliente-1" />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole("alert")).toHaveTextContent("Consulta de contactos incompleta");
  expect(screen.getByRole("button", { name: "Usar contacto Compras" })).toBeEnabled();
  const campo = screen.getByRole("textbox", { name: "Enviar a" });
  fireEvent.change(campo, { target: { value: "capturado@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(fetchContactosClienteEnvio).toHaveBeenCalledTimes(2);
  expect(campo).toHaveValue("capturado@example.test");
});

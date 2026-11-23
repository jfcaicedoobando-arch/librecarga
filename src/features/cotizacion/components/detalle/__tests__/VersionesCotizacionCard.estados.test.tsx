import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VersionesCotizacionCard } from "../VersionesCotizacionCard";

const { fetchVersiones } = vi.hoisted(() => ({ fetchVersiones: vi.fn() }));
vi.mock("@/features/cotizacion/services/versiones", () => ({ fetchVersiones, duplicarCotizacionRpc: vi.fn() }));

function mostrar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <VersionesCotizacionCard cotizacionId="cot-1" estadoActual="Aceptada" />
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => fetchVersiones.mockReset());

describe("Historial de versiones de cotización", () => {
  it("permanece visible ante un fallo y reintenta hasta recuperar el historial", async () => {
    fetchVersiones.mockRejectedValueOnce(new Error("Error transitorio")).mockResolvedValue([
      { id: "v1", folio: "COT-001", version_num: 1, estado_al_snapshot: "Enviada", created_at: "2026-11-20" },
    ]);
    mostrar();

    expect(screen.getByRole("status")).toHaveTextContent("Cargando historial");
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el historial de versiones");
    expect(screen.getByText("Historial de versiones")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("COT-001")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchVersiones.mock.calls).toEqual([["cot-1"], ["cot-1"]]);
  });

  it("oculta el historial si la consulta confirma que no hay versiones", async () => {
    fetchVersiones.mockResolvedValue([]);
    mostrar();
    await waitFor(() => expect(screen.queryByText("Historial de versiones")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("conserva el historial consultado si falla su actualización y permite recuperarlo", async () => {
    const version = { id: "v1", folio: "COT-001", version_num: 1, estado_al_snapshot: "Enviada", created_at: "2026-11-20" };
    fetchVersiones.mockResolvedValueOnce([version]).mockRejectedValueOnce(new Error("Error transitorio"))
      .mockResolvedValueOnce([version]);
    const client = mostrar();
    expect(await screen.findByText("COT-001")).toBeInTheDocument();

    await act(() => client.invalidateQueries());
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo actualizar el historial de versiones");
    expect(screen.getByText("COT-001")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(fetchVersiones).toHaveBeenCalledTimes(3);
  });
});

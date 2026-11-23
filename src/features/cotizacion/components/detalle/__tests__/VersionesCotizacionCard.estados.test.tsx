import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VersionesCotizacionCard } from "../VersionesCotizacionCard";

const { fetchVersiones } = vi.hoisted(() => ({ fetchVersiones: vi.fn() }));
vi.mock("@/features/cotizacion/services/versiones", () => ({ fetchVersiones, duplicarCotizacionRpc: vi.fn() }));

function mostrar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <VersionesCotizacionCard cotizacionId="cot-1" estadoActual="Aceptada" />
    </QueryClientProvider>,
  );
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
});

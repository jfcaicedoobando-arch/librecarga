import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { CargoFormDialog } from "../CargoFormDialog";
import { guardarCargo, listarEntidadesCargo } from "../cargosService";

vi.mock("../cargosService", () => ({ listarEntidadesCargo: vi.fn(), guardarCargo: vi.fn() }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));

describe("monto del cargo de tarifario", () => {
  it("bloquea el monto en blanco y admite un cero escrito", async () => {
    vi.mocked(listarEntidadesCargo).mockResolvedValue([{ id: "a1", nombre: "Agente uno" }]);
    vi.mocked(guardarCargo).mockResolvedValue();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}>
      <CargoFormDialog tipo="fob" orgId="org" cargo={null} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>);
    const selector = screen.getAllByRole("combobox")[0];
    await waitFor(() => expect(selector).toBeEnabled());
    fireEvent.keyDown(selector, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Agente uno" }));

    const monto = screen.getByRole("textbox", { name: "Monto" });
    const guardar = screen.getByRole("button", { name: "Guardar" });
    fireEvent.click(guardar);
    expect(screen.getByRole("alert")).toHaveTextContent("Captura el monto");
    expect(monto).toHaveFocus();
    expect(monto).toHaveAccessibleDescription("Captura el monto. Escribe 0 si el cargo no tiene costo.");
    fireEvent.change(monto, { target: { value: " " } });
    fireEvent.click(guardar);
    expect(guardarCargo).not.toHaveBeenCalled();

    fireEvent.change(monto, { target: { value: "0" } });
    expect(monto).not.toHaveAttribute("aria-invalid");
    fireEvent.click(guardar);
    await waitFor(() => expect(guardarCargo).toHaveBeenCalledExactlyOnceWith("fob", "org",
      expect.objectContaining({ entidad_id: "a1", monto: 0 }), undefined));
  });

  it("permite reintentar un catálogo fallido y distingue el vacío confirmado", async () => {
    vi.mocked(listarEntidadesCargo).mockRejectedValueOnce(new Error("falló catálogo")).mockResolvedValueOnce([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}>
      <CargoFormDialog tipo="fob" orgId="org" cargo={null} onClose={vi.fn()} onSaved={vi.fn()} />
    </QueryClientProvider>);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo consultar el catálogo del cargo.");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText(/No hay agentes activos/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });
});

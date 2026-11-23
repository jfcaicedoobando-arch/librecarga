import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    const selector = screen.getByRole("combobox", { name: "Agente" });
    expect(screen.getByRole("combobox", { name: "Moneda" })).toBeInTheDocument();
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

  it("bloquea Cancelar mientras guarda y cierra al confirmar el cargo", async () => {
    vi.mocked(listarEntidadesCargo).mockResolvedValue([{ id: "a1", nombre: "Agente uno" }]);
    let completarGuardado!: () => void;
    vi.mocked(guardarCargo).mockReturnValueOnce(new Promise<void>((resolve) => { completarGuardado = resolve; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<QueryClientProvider client={client}>
      <CargoFormDialog tipo="fob" orgId="org" cargo={null} onClose={onClose} onSaved={onSaved} />
    </QueryClientProvider>);
    const selector = screen.getByRole("combobox", { name: "Agente" });
    await waitFor(() => expect(selector).toBeEnabled());
    fireEvent.keyDown(selector, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Agente uno" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Monto" }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    const cancelar = screen.getByRole("button", { name: "Cancelar" });
    expect(cancelar).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardando cargo…" })).toBeDisabled();
    fireEvent.click(cancelar);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => completarGuardado());
    expect(onSaved).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

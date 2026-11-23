import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NotificacionesPopover } from "../NotificacionesPopover";

const { useNotificacionesInternas } = vi.hoisted(() => ({ useNotificacionesInternas: vi.fn() }));
vi.mock("@/features/notificaciones/hooks/useNotificacionesInternas", () => ({ useNotificacionesInternas }));

describe("NotificacionesPopover", () => {
  it("nombra el panel y no coloca el foco inicial en el marcado masivo", async () => {
    const marcarTodasLeidas = vi.fn();
    useNotificacionesInternas.mockReturnValue({
      notificaciones: [], noLeidas: 1, isSuccess: true, isError: false, marcarTodasLeidas,
    });
    render(
      <MemoryRouter>
        <TooltipProvider><NotificacionesPopover /></TooltipProvider>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Notificaciones, 1 sin leer" }));
    const panel = screen.getByRole("dialog", { name: "Notificaciones" });
    const marcar = screen.getByRole("button", { name: "Marcar todas como leídas" });
    await waitFor(() => expect(panel).toContainElement(document.activeElement as HTMLElement));
    expect(marcar).not.toHaveFocus();
    expect(marcarTodasLeidas).not.toHaveBeenCalled();
  });

  it("distingue entre carga, error y una bandeja vacía confirmada", () => {
    const refetch = vi.fn();
    const base = { notificaciones: [], noLeidas: 0, refetch };
    useNotificacionesInternas.mockReturnValue({ ...base, isFetching: true, isSuccess: false, isError: false });
    const ui = () => (
      <MemoryRouter>
        <TooltipProvider><NotificacionesPopover /></TooltipProvider>
      </MemoryRouter>
    );
    const { rerender } = render(ui());
    fireEvent.click(screen.getByRole("button", { name: "Notificaciones" }));
    expect(screen.getByRole("status")).toHaveTextContent("Cargando notificaciones");
    expect(screen.queryByText("Sin notificaciones")).toBeNull();

    useNotificacionesInternas.mockReturnValue({ ...base, isFetching: false, isSuccess: false, isError: true });
    rerender(ui());
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar las notificaciones");
    expect(screen.queryByText("Sin notificaciones")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();

    useNotificacionesInternas.mockReturnValue({ ...base, isFetching: false, isSuccess: true, isError: false });
    rerender(ui());
    expect(screen.getByText("Sin notificaciones")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

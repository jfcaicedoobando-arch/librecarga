import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NotificacionesPopover } from "../NotificacionesPopover";

const { useNotificacionesInternas } = vi.hoisted(() => ({ useNotificacionesInternas: vi.fn() }));
vi.mock("@/features/notificaciones/hooks/useNotificacionesInternas", () => ({ useNotificacionesInternas }));

describe("NotificacionesPopover", () => {
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

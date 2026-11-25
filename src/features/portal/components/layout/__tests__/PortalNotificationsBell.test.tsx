import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PortalNotificationsBell } from "../PortalNotificationsBell";

const mocks = vi.hoisted(() => ({ marcar: vi.fn(), marcarTodas: vi.fn() }));
vi.mock("@/features/portal/hooks", () => ({
  useNotificacionesCliente: () => ({
    data: [
      { id: "n1", titulo: "Aviso nuevo", mensaje: null, leida_at: null, url: null, created_at: "2026-09-10T20:00:00Z" },
      { id: "n2", titulo: "Aviso anterior", mensaje: null, leida_at: "2026-09-11T00:00:00Z", url: null, created_at: "2026-09-09T20:00:00Z" },
    ],
  }),
  useMarcarNotificacionLeida: () => ({ mutateAsync: mocks.marcar }),
  useMarcarTodasLeidas: () => ({ mutate: mocks.marcarTodas, isPending: false }),
}));

describe("PortalNotificationsBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.marcar.mockResolvedValue(undefined);
  });

  it("permite recorrer los avisos, anunciar los no leídos y cerrar sin marcarlos", async () => {
    render(<MemoryRouter><PortalNotificationsBell /></MemoryRouter>);
    const trigger = screen.getByRole("button", { name: "Notificaciones, 1 sin leer" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Notificaciones" })).toBeVisible();

    const avisoNuevo = screen.getByRole("button", { name: /No leída\. Aviso nuevo/ });
    const avisoAnterior = screen.getByRole("button", { name: /Aviso anterior/ });
    expect(avisoNuevo.tabIndex).toBe(0);
    expect(avisoAnterior.tabIndex).toBe(0);
    act(() => avisoNuevo.focus());
    expect(avisoNuevo).toHaveFocus();
    act(() => avisoAnterior.focus());
    expect(avisoAnterior).toHaveFocus();

    fireEvent.keyDown(avisoAnterior, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(mocks.marcar).not.toHaveBeenCalled();
    expect(mocks.marcarTodas).not.toHaveBeenCalled();
  });

  it("marca una vez un aviso aunque se pulse antes de que se actualice la lista", () => {
    render(<MemoryRouter><PortalNotificationsBell /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Notificaciones, 1 sin leer" }));
    const aviso = screen.getByRole("button", { name: /Aviso nuevo/ });
    fireEvent.click(aviso);
    fireEvent.click(aviso);
    expect(mocks.marcar).toHaveBeenCalledExactlyOnceWith("n1");
  });
});

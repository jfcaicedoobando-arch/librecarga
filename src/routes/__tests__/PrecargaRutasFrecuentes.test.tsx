import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrecargaRutasFrecuentes } from "../PrecargaRutasFrecuentes";

const { auth, precargar } = vi.hoisted(() => ({
  auth: { user: null as { id: string } | null, loading: true },
  precargar: vi.fn(),
}));

vi.mock("@/lib/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../appRoutes.lazy", () => ({ precargarRutasFrecuentes: precargar }));

beforeEach(() => {
  auth.user = null;
  auth.loading = true;
  precargar.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("precarga de rutas frecuentes", () => {
  it("espera a un usuario con perfil resuelto y utiliza el tiempo libre", () => {
    const idle = vi.fn<(run: () => void) => number>(() => 7);
    vi.stubGlobal("requestIdleCallback", idle);
    const { rerender } = render(<PrecargaRutasFrecuentes />);

    auth.user = { id: "u1" };
    rerender(<PrecargaRutasFrecuentes />);
    expect(idle).not.toHaveBeenCalled();

    auth.loading = false;
    rerender(<PrecargaRutasFrecuentes />);
    expect(idle).toHaveBeenCalledTimes(1);
    expect(precargar).not.toHaveBeenCalled();

    idle.mock.calls[0][0]();
    expect(precargar).toHaveBeenCalledTimes(1);
  });

  it("cancela la precarga pendiente al cerrar la sesión", () => {
    auth.user = { id: "u1" };
    auth.loading = false;
    const cancel = vi.fn();
    vi.stubGlobal("requestIdleCallback", vi.fn(() => 7));
    vi.stubGlobal("cancelIdleCallback", cancel);
    const { rerender } = render(<PrecargaRutasFrecuentes />);

    auth.user = null;
    rerender(<PrecargaRutasFrecuentes />);

    expect(cancel).toHaveBeenCalledWith(7);
    expect(precargar).not.toHaveBeenCalled();
  });

  it("usa el fallback de 1.5 segundos y descarta la espera al desmontar", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    auth.user = { id: "u1" };
    auth.loading = false;
    const { unmount } = render(<PrecargaRutasFrecuentes />);

    act(() => vi.advanceTimersByTime(1499));
    expect(precargar).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(precargar).toHaveBeenCalledTimes(1);
    unmount();

    const pending = render(<PrecargaRutasFrecuentes />);
    pending.unmount();
    act(() => vi.advanceTimersByTime(1500));
    expect(precargar).toHaveBeenCalledTimes(1);
  });
});

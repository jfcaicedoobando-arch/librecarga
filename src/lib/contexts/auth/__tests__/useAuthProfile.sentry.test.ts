import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";

const sentryMock = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@/lib/observability/sentry/runtime", () => ({ loadInitializedSentry: async () => sentryMock }));

const { mockFetchUserContext } = vi.hoisted(() => ({ mockFetchUserContext: vi.fn() }));
vi.mock("@/features/auth/services/session", () => ({ fetchUserContext: mockFetchUserContext }));

import { queryClient } from "@/lib/query/queryClient";

function Wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}
import { useAuthProfile } from "../useAuthProfile";

// v13.137.35: spy a `console.error` administrado en beforeEach/afterEach. Antes
// se creaba dentro del test sin try/finally → si `waitFor` fallaba, el spy nunca
// se restauraba y `console.error` quedaba silenciado para todo el resto del shard.
let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  sentryMock.captureException.mockClear();
  mockFetchUserContext.mockReset();
  queryClient.clear();
  queryClient.setQueryDefaults(["auth", "user-context"], { retryDelay: 0 });
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  queryClient.clear();
  errSpy?.mockRestore();
  vi.clearAllMocks();
});

describe("useAuthProfile — captureException", () => {
  it("reporta una vez tras agotar los intentos de cargar el perfil", async () => {
    const boom = new Error("profile-fetch-down");
    mockFetchUserContext.mockRejectedValue(boom);

    const { unmount } = renderHook(() => useAuthProfile("u-XYZ"), { wrapper: Wrapper });

    await waitFor(() =>
      expect(sentryMock.captureException).toHaveBeenCalledWith(
        boom,
        expect.objectContaining({ tags: expect.objectContaining({ feature: "auth", phase: "fetchUserContext" }) }),
      ),
    );
    expect(mockFetchUserContext).toHaveBeenCalledTimes(2);
    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("NO reporta cuando fetchUserContext resuelve", async () => {
    // v13.137.24: antes el negativo se aseveraba tras un `setTimeout(20)` real
    // (frágil + falso positivo silencioso). Ahora primero esperamos a que el
    // efecto efectivamente llame al servicio (rama de éxito) y sólo entonces
    // verificamos que Sentry NO se invocó.
    mockFetchUserContext.mockResolvedValue({
      role: "user",
      orgRole: "user",
      organizationId: "o-1",
      organization: null,
    });
    const { unmount } = renderHook(() => useAuthProfile("u-OK"), { wrapper: Wrapper });
    await waitFor(() => expect(mockFetchUserContext).toHaveBeenCalled());
    // microtask flush para que cualquier `.catch` ya hubiese disparado
    await Promise.resolve();
    await Promise.resolve();
    expect(sentryMock.captureException).not.toHaveBeenCalled();
    unmount();
  });
});

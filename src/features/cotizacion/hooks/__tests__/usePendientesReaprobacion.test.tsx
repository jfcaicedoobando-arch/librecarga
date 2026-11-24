import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { useMisCotizacionesPendientesReaprobacion } from "../usePendientesReaprobacion";

const { contar, contexto } = vi.hoisted(() => ({
  contar: vi.fn(),
  contexto: { organizationId: "org-1", effectiveRole: "admin" },
}));
vi.mock("@/lib/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { email: "operador@example.test" }, effectiveRole: contexto.effectiveRole }),
}));
vi.mock("@/hooks/shared/useOrgFilter", () => ({
  useOrgFilter: () => ({ organizationId: contexto.organizationId, orgListo: true }),
}));
vi.mock("@/features/cotizacion/services/pendientesReaprobacion", () => ({
  contarMisCotizacionesPendientesReaprobacion: contar,
}));

it("usa la organización activa y oculta un resultado cacheado al perder acceso", async () => {
  contar.mockResolvedValueOnce(2).mockResolvedValueOnce(5);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result, rerender } = renderHook(useMisCotizacionesPendientesReaprobacion, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.data).toBe(2));
  expect(contar).toHaveBeenCalledWith("operador@example.test", "org-1");

  contexto.organizationId = "org-2";
  rerender();
  expect(result.current.data).toBeUndefined();
  await waitFor(() => expect(result.current.data).toBe(5));
  expect(contar).toHaveBeenLastCalledWith("operador@example.test", "org-2");

  contexto.effectiveRole = "tesorero";
  rerender();
  expect(result.current.data).toBeUndefined();
  expect(contar).toHaveBeenCalledTimes(2);
});

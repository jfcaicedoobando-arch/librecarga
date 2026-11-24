// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { NuqsAdapter } from "nuqs/adapters/react-router/v8";
import { BrowserRouter, useNavigate } from "react-router";
import { expect, it, vi } from "vitest";
import { useCotizacionesPageController } from "../useCotizacionesPageController";

const { fetchPage, fetchCsv, fetchAgregados } = vi.hoisted(() => ({
  fetchPage: vi.fn(), fetchCsv: vi.fn(), fetchAgregados: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/hooks/shared/useOrgFilter", () => ({
  useOrgFilter: () => ({ organizationId: "org-1", orgListo: true }),
}));
vi.mock("@/lib/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { email: "operador@example.test" } }),
}));
vi.mock("@/hooks/shared/usePermissions", () => ({
  usePermissions: () => ({ canWriteCotizaciones: false }),
}));
vi.mock("@/features/cliente/hooks/useClientes", () => ({
  useClientesForSelect: () => ({ data: [] }),
}));
vi.mock("../useCotizacionActions", () => ({
  useCotizacionActions: () => ({ exportar: (load: () => Promise<unknown>) => load() }),
}));
vi.mock("@/features/cotizacion/services/paginados", () => ({
  SORT_KEY_TO_COLUMN: { fecha: "created_at" },
  fetchCotizacionesPaginadas: fetchPage,
  fetchTodasCotizacionesParaExportar: fetchCsv,
}));
vi.mock("@/features/cotizacion/services/agregados", () => ({
  fetchCotizacionAgregados: fetchAgregados,
}));

it("normaliza un enlace contradictorio y conserva los demás filtros en la lista y el CSV", async () => {
  fetchPage.mockResolvedValue({ rows: [], count: 20 });
  fetchCsv.mockResolvedValue([]);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const onUrlUpdate = vi.fn();
  const { result } = renderHook(useCotizacionesPageController, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>
        <NuqsTestingAdapter hasMemory
          searchParams="?q=barco&page=3&estado=Borrador&aceptadasSinEmbarque=si&cliente=c1&segmento=prospectos"
          onUrlUpdate={onUrlUpdate}>
          {children}
        </NuqsTestingAdapter>
      </QueryClientProvider>
    ),
  });

  const filtros = { filterEstado: "todos", soloAceptadasSinEmbarque: true, search: "barco", filterCliente: "c1", segmento: "prospectos" };
  await waitFor(() => expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ ...filtros, page: 0 })));
  expect(result.current.activeChips.map((chip) => chip.key)).not.toContain("filter:estado");
  expect(result.current.activeChips.map((chip) => chip.key)).toContain("filter:aceptadasSinEmbarque");
  const url = onUrlUpdate.mock.lastCall?.[0].searchParams as URLSearchParams;
  expect(url.has("estado")).toBe(false);
  expect(url.get("aceptadasSinEmbarque")).toBe("si");
  expect(url.has("page")).toBe(false);

  await result.current.exportar();
  expect(fetchCsv).toHaveBeenCalledWith(expect.objectContaining(filtros), "fecha", "desc");
});

it("conserva la lista cuando fallan los agregados y reintenta sólo sus conteos", async () => {
  fetchPage.mockClear().mockResolvedValue({ rows: [], count: 20 });
  fetchAgregados.mockRejectedValueOnce(new Error("Falla de indicadores"));
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(useCotizacionesPageController, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}><NuqsTestingAdapter>{children}</NuqsTestingAdapter></QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.errorAgregados).toBe(true));
  await waitFor(() => expect(result.current.total).toBe(20));
  expect(result.current.isError).toBe(false);
  expect(result.current.kpis).toBeUndefined();
  expect(result.current.segmentoConteos).toBeUndefined();

  fetchAgregados.mockResolvedValueOnce({
    kpis: { total: 0, aceptadas: 0, rechazadas: 0, tasa: "0.0" },
    segmentoConteos: { clientes: 20, prospectos: 1, todas: 21 }, totalAceptadasSinEmbarque: 0,
  });
  const lecturasListaAntes = fetchPage.mock.calls.length;
  await act(async () => { await result.current.reintentarAgregados(); });
  await waitFor(() => expect(result.current.segmentoConteos).toEqual({ clientes: 20, prospectos: 1, todas: 21 }));
  expect(result.current.kpis?.total).toBe(0);
  expect(fetchPage).toHaveBeenCalledTimes(lecturasListaAntes);
});

it("aplica los pendientes propios desde el enlace, respeta el historial y permite retirar el filtro", async () => {
  const listado = "/cotizaciones?cliente=c1";
  const pendientes = "/cotizaciones?reaprobacion=pendiente";
  const filtros = {
    organizationId: "org-1", reaprobacionOperador: "operador@example.test",
    incluirInactivas: true, segmento: "todas", page: 0,
  };
  fetchPage.mockClear().mockResolvedValue({ rows: [], count: 1 });
  fetchCsv.mockClear().mockResolvedValue([]);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  window.history.replaceState({ idx: 0, key: "initial", usr: null }, "", listado);
  const { result, unmount } = renderHook(() => ({
    vista: useCotizacionesPageController(), navigate: useNavigate(),
  }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <BrowserRouter><NuqsAdapter><QueryClientProvider client={cache}>{children}</QueryClientProvider></NuqsAdapter></BrowserRouter>
    ),
  });
  try {
    expect(result.current.vista.soloMisReaprobaciones).toBe(false);
    act(() => { void result.current.navigate(pendientes); });
    await waitFor(() => expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining(filtros)));
    expect(result.current.vista.soloMisReaprobaciones).toBe(true);
    expect(result.current.vista.activeChips[0]?.label).toBe("Mis cotizaciones pendientes de reaprobación");

    act(() => { void result.current.navigate(-1); });
    await waitFor(() => expect(result.current.vista.soloMisReaprobaciones).toBe(false));
    expect(result.current.vista.filterCliente).toBe("c1");
    act(() => { void result.current.navigate(1); });
    await waitFor(() => expect(result.current.vista.soloMisReaprobaciones).toBe(true));

    await result.current.vista.exportar();
    expect(fetchCsv).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: filtros.organizationId,
        reaprobacionOperador: filtros.reaprobacionOperador,
        incluirInactivas: true,
        segmento: "todas",
      }),
      "fecha", "desc",
    );

    act(() => result.current.vista.activeChips[0]?.onRemove());
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(result.current.vista.soloMisReaprobaciones).toBe(false);
    expect(result.current.vista.segmento).toBe("clientes");
    expect(result.current.vista.activeChips).toHaveLength(0);
  } finally {
    unmount();
    window.history.replaceState(null, "", "/");
  }
});

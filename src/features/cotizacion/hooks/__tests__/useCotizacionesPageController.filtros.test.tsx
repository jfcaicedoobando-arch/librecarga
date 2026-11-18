import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { expect, it, vi } from "vitest";
import { useCotizacionesPageController } from "../useCotizacionesPageController";

const { fetchPage, fetchCsv } = vi.hoisted(() => ({ fetchPage: vi.fn(), fetchCsv: vi.fn() }));
vi.mock("@/hooks/shared/useOrgFilter", () => ({
  useOrgFilter: () => ({ organizationId: "org-1" }),
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
  fetchCotizacionAgregados: async () => null,
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

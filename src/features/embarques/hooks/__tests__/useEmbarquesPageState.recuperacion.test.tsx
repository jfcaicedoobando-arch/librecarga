import { act, renderHook, waitFor } from "@testing-library/react";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEmbarquesPageState } from "../useEmbarquesPageState";

const m = vi.hoisted(() => ({
  query: { data: { data: [], count: 46 }, isError: false, isLoading: false, isPlaceholderData: false },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ ...m.query, isSuccess: !m.query.isError && !m.query.isLoading }),
}));
vi.mock("@/hooks/shared", () => ({
  useOrgFilter: () => ({ organizationId: "org-1", orgListo: true }),
  useDebounce: (value: string) => value,
}));
vi.mock("../useEmbarquesAlertasResumen", () => ({ useEmbarquesAlertasResumen: () => ({}) }));
vi.mock("../../queries", () => ({ embarqueQueries: { list: () => ({}) } }));

beforeEach(() => {
  m.query = { data: { data: [], count: 46 }, isError: false, isLoading: false, isPlaceholderData: false };
});
const wrapper = (searchParams = "?page=3&estado=Confirmado&q=ACME") =>
  withNuqsTestingAdapter({ hasMemory: true, searchParams });

describe("recuperación del listado de embarques", () => {
  it.each([[46, 0], [55, 1]])("ajusta la página usando el conteo %d y conserva los filtros", async (conteo, ultimaPagina) => {
    m.query.data.count = conteo;
    const { result } = renderHook(() => useEmbarquesPageState(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.page).toBe(ultimaPagina));
    expect(result.current.search).toBe("ACME");
    expect(result.current.filterEstado).toBe("Confirmado");
    expect(result.current.totalCount).toBe(conteo);
  });

  it.each(["isError", "isLoading", "isPlaceholderData"] as const)("conserva la página cuando %s", (flag) => {
    m.query[flag] = true;
    const { result } = renderHook(() => useEmbarquesPageState(), { wrapper: wrapper() });
    expect(result.current.page).toBe(3);
  });

  it("restablece el orden predeterminado y vuelve a la primera página", async () => {
    m.query.data.count = 1000;
    const { result } = renderHook(() => useEmbarquesPageState(), {
      wrapper: wrapper("?page=3&sort=eta&dir=asc&estado=Confirmado"),
    });
    await act(async () => { result.current.handleSortChange(null, "desc"); });
    expect(result.current.sortKey).toBe("expediente");
    expect(result.current.sortDir).toBe("desc");
    expect(result.current.page).toBe(0);
    expect(result.current.filterEstado).toBe("Confirmado");
  });
});

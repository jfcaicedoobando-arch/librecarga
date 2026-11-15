import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePerfilFiscalEmisor } from "../usePerfilFiscalEmisor";
import { perfilFiscalEmisorKeys } from "../../queryKeys";
import type { FacturapiAmbiente } from "../../services/facturapiCredenciales";

const mocks = vi.hoisted(() => ({ user: "user-a", request: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: mocks.user } }) }));
vi.mock("../../services/perfilFiscalEmisor", () => ({ solicitarPerfilFiscal: mocks.request }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: mocks.success, notifyError: mocks.error }));
const data = (version: number, ambiente: FacturapiAmbiente = "sandbox") => ({
  ambiente, version, estado: "sin_sincronizar", problemas: [], perfil: null,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
describe("perfil fiscal: respuestas diferidas", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.user = "user-a"; });
  afterEach(cleanup);
  it.each(["organización", "ambiente", "usuario"])("no presenta una consulta anterior tras cambiar %s", async (change) => {
    const old = deferred<ReturnType<typeof data>>();
    mocks.request.mockReturnValueOnce(old.promise).mockResolvedValue(data(2, change === "ambiente" ? "live" : "sandbox"));
    const { client, wrapper } = setup();
    const { result, rerender, unmount } = renderHook(({ org, ambiente }) => usePerfilFiscalEmisor(org, ambiente), {
      wrapper, initialProps: { org: "org-a", ambiente: "sandbox" as FacturapiAmbiente },
    });
    await waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
    if (change === "usuario") mocks.user = "user-b";
    rerender({ org: change === "organización" ? "org-b" : "org-a", ambiente: change === "ambiente" ? "live" : "sandbox" });
    await waitFor(() => expect(result.current.query.data?.version).toBe(2));
    await act(async () => { old.resolve(data(1)); await old.promise; });
    expect(result.current.query.data?.version).toBe(2);
    unmount(); client.clear();
  });
  it.each(["organización", "ambiente", "usuario"])("una mutación tardía conserva su clave y omite el aviso al cambiar %s", async (change) => {
    const pending = deferred<ReturnType<typeof data>>();
    mocks.request.mockImplementation((body) => body.accion === "consultar" ? Promise.resolve(data(1, body.ambiente)) : pending.promise);
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result, rerender, unmount } = renderHook(({ org, ambiente }) => usePerfilFiscalEmisor(org, ambiente), {
      wrapper, initialProps: { org: "org-a", ambiente: "sandbox" as FacturapiAmbiente },
    });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    act(() => result.current.mutation.mutate({ accion: "sincronizar" }));
    await waitFor(() => expect(result.current.mutation.isPending).toBe(true));
    if (change === "usuario") mocks.user = "user-b";
    rerender({ org: change === "organización" ? "org-b" : "org-a", ambiente: change === "ambiente" ? "live" : "sandbox" });
    await act(async () => { pending.resolve(data(2)); await pending.promise; });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: perfilFiscalEmisorKeys.detalle("org-a", "sandbox", "user-a") }));
    expect(mocks.success).not.toHaveBeenCalled();
    expect(result.current.query.data?.version).toBe(1);
    unmount(); client.clear();
  });
  it("oculta también el error tardío tras desmontar", async () => {
    const pending = deferred<ReturnType<typeof data>>();
    mocks.request.mockImplementation((body) => body.accion === "consultar" ? Promise.resolve(data(1)) : pending.promise);
    const { client, wrapper } = setup();
    const { result, unmount } = renderHook(() => usePerfilFiscalEmisor("org-a", "sandbox"), { wrapper });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    act(() => result.current.mutation.mutate({ accion: "sincronizar" }));
    await waitFor(() => expect(result.current.mutation.isPending).toBe(true));
    unmount();
    await act(async () => { pending.reject(new Error("Error anterior")); });
    expect(mocks.error).not.toHaveBeenCalled();
    client.clear();
  });
  it("mantiene la mutación pendiente hasta refrescar la versión confirmada", async () => {
    const refresh = deferred<ReturnType<typeof data>>();
    mocks.request.mockResolvedValueOnce(data(1)).mockResolvedValueOnce(data(2)).mockReturnValueOnce(refresh.promise);
    const { client, wrapper } = setup();
    const { result, unmount } = renderHook(() => usePerfilFiscalEmisor("org-a", "sandbox"), { wrapper });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    act(() => result.current.mutation.mutate({ accion: "confirmar", perfil_id: "perfil-a" }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(3));
    expect(result.current.mutation.isPending).toBe(true);
    expect(mocks.success).toHaveBeenCalledWith(undefined, { title: "Perfil fiscal confirmado" });
    await act(async () => { refresh.resolve(data(2)); await refresh.promise; });
    await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true));
    expect(result.current.query.data?.version).toBe(2);
    unmount(); client.clear();
  });
});

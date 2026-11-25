import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createWrapper } from "@/test/utils/queryWrapper";
import { setAuthSnapshot } from "@/lib/auth/authSnapshot";
import { clientes } from "@/features/cliente/queryKeys";

const mocks = vi.hoisted(() => ({
  fetchContactos: vi.fn(),
}));

vi.mock("@/services/emails/contactosCliente", () => ({
  fetchContactosClienteConEmail: (id: string) => mocks.fetchContactos(id),
}));

vi.mock("@/lib/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { email: "yo@empresa.com" } }),
}));

import { useEnvioDocumentoForm } from "../useEnvioDocumentoForm";

const autenticado = {
  userId: "usuario-prueba", email: "yo@empresa.com", organizationId: "org-a",
  organizationName: "Organización de prueba", role: "admin_org", effectiveRole: "admin_org",
};
const filaFicha = { id: "sin-correo", email: null, telefono: "000" };
const principal = { id: "__cliente_principal__", email: "principal@example.test", nombre: "Principal", tipo: "Cliente" };

function cacheCaliente() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
  Object.assign(globalThis, { __TEST_QUERY_CLIENT__: client });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

describe("useEnvioDocumentoForm", () => {
  beforeEach(() => {
    mocks.fetchContactos.mockReset();
    setAuthSnapshot(autenticado);
  });

  it("preselecciona el contacto principal cuando existe", async () => {
    mocks.fetchContactos.mockResolvedValue([
      { id: "__cliente_principal__", email: "principal@x.com", contacto: "Principal", tipo: "principal" },
      { id: "c2", email: "otro@x.com", contacto: "Otro", tipo: "operativo" },
    ]);
    const { result } = renderHook(
      () => useEnvioDocumentoForm(true, "cli-1", () => "Asunto inicial"),
      { wrapper: createWrapper() },
    );

    await waitFor(() =>
      expect(result.current.destinatarios.map((d) => d.email)).toContain(
        "principal@x.com",
      ),
    );
    expect(result.current.asunto).toBe("Asunto inicial");
  });

  it("añade y quita emails manuales con validación", async () => {
    mocks.fetchContactos.mockResolvedValue([]);
    const { result } = renderHook(
      () => useEnvioDocumentoForm(true, "cli-1", () => ""),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.loadingContactos).toBe(false));

    // email inválido no se agrega
    act(() => result.current.setEmailManual("no-es-email"));
    act(() => result.current.agregarManual());
    expect(result.current.emailsManualesAgregados).toEqual([]);

    // email válido sí
    act(() => result.current.setEmailManual("nuevo@x.com"));
    act(() => result.current.agregarManual());
    expect(result.current.emailsManualesAgregados).toEqual(["nuevo@x.com"]);

    // aparece en destinatarios
    expect(result.current.destinatarios.map((d) => d.email)).toContain(
      "nuevo@x.com",
    );

    // quitar
    act(() => result.current.quitarManual("nuevo@x.com"));
    expect(result.current.emailsManualesAgregados).toEqual([]);
  });

  it("agrega al usuario logueado como CC por defecto", async () => {
    mocks.fetchContactos.mockResolvedValue([
      { id: "__cliente_principal__", email: "p@x.com", contacto: "P", tipo: "principal" },
    ]);
    const { result } = renderHook(
      () => useEnvioDocumentoForm(true, "cli-1", () => ""),
      { wrapper: createWrapper() },
    );
    await waitFor(() =>
      expect(result.current.destinatarios.length).toBeGreaterThan(0),
    );
    expect(result.current.ccEmails).toContain("yo@empresa.com");
  });

  it.each([true, false])("en facturas respeta si el operador es contacto registrado (%s)", async (esContacto) => {
    mocks.fetchContactos.mockResolvedValue([
      { id: "__cliente_principal__", email: "p@x.com", contacto: "P", tipo: "principal" },
      ...(esContacto ? [{ id: "copias", email: "Yo@Empresa.com", contacto: "Operador" }] : []),
    ]);
    const { result } = renderHook(
      () => useEnvioDocumentoForm(true, "cli-1", () => "", {
        ccInicial: ["yo@empresa.com"],
        copiaSoloContacto: true,
      }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.destinatarios).toHaveLength(1));
    expect(result.current.ccEmails).toEqual(esContacto ? ["Yo@Empresa.com"] : []);
    expect(result.current.userEmail).toBe(esContacto ? "Yo@Empresa.com" : null);
  });

  it("consulta destinatarios aun si la ficha tiene contactos frescos sin correo", async () => {
    const { client, wrapper } = cacheCaliente();
    const ficha = clientes.contactos("cli-1");
    client.setQueryData(ficha, [filaFicha]);
    mocks.fetchContactos.mockResolvedValue([principal]);
    const { result } = renderHook(() => useEnvioDocumentoForm(true, "cli-1", () => "", {
      copiaSoloContacto: true,
    }), { wrapper });
    await waitFor(() => expect(result.current.contactos).toEqual([principal]));
    expect(mocks.fetchContactos).toHaveBeenCalledWith("cli-1");
    expect(client.getQueryData(ficha)).toEqual([filaFicha]);
  });

  it("la ficha consulta su lista completa aunque el correo haya cargado primero", async () => {
    const { client, wrapper } = cacheCaliente();
    mocks.fetchContactos.mockResolvedValue([principal]);
    const { result } = renderHook(() => useEnvioDocumentoForm(true, "cli-1", () => ""), { wrapper });
    await waitFor(() => expect(result.current.contactos).toEqual([principal]));
    const fetchFicha = vi.fn(async () => [filaFicha]);
    const ficha = await client.fetchQuery({ queryKey: clientes.contactos("cli-1"), queryFn: fetchFicha });
    expect(fetchFicha).toHaveBeenCalledOnce();
    expect(ficha).toEqual([filaFicha]);
    expect(result.current.contactos).toEqual([principal]);
  });

  it("descarta una lectura anterior cuando cambia la organización", async () => {
    let terminar: (rows: unknown[]) => void = () => undefined;
    mocks.fetchContactos
      .mockReturnValueOnce(new Promise((resolve) => { terminar = resolve; }))
      .mockResolvedValueOnce([{ ...principal, email: "org-b@example.test" }]);
    const { result, rerender } = renderHook(() => useEnvioDocumentoForm(true, "cli-1", () => ""), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(mocks.fetchContactos).toHaveBeenCalledOnce());
    setAuthSnapshot({ ...autenticado, organizationId: "org-b" });
    rerender();
    await waitFor(() => expect(result.current.contactos[0]?.email).toBe("org-b@example.test"));
    await act(async () => terminar([principal]));
    expect(result.current.destinatarios.map(({ email }) => email)).toEqual(["org-b@example.test"]);
  });
});

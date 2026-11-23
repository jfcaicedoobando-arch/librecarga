import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useConfiguracionState } from "../useConfiguracionState";

const mock = vi.hoisted(() => ({
  orgId: "org-a",
  data: [{ categoria: "empresa", clave: "nombre", valor: "Guardado" }],
  mutate: vi.fn(),
}));
vi.mock("@/hooks/shared/useOrgActiva", () => ({
  useOrgActiva: () => ({ organizationId: mock.orgId }),
}));
vi.mock("../useConfiguracion", () => ({
  useConfiguracion: () => ({ data: mock.data, isLoading: false }),
  useUpdateConfiguracion: () => ({ mutate: mock.mutate, isPending: false }),
}));

it("preserva la captura ante un refetch y aplica sólo las claves editadas", () => {
  const { result, rerender } = renderHook(() => useConfiguracionState());
  act(() => result.current.set("nombre")("Borrador"));
  mock.data = [...mock.data, { categoria: "empresa", clave: "email", valor: "otro@example.invalid" }];
  rerender();
  expect(result.current.s.nombre).toBe("Borrador");
  expect(result.current.isDirty).toBe(true);
  expect(result.current.cambioRemoto).toBe(true);
  act(() => result.current.handleSave());
  expect(mock.mutate).toHaveBeenCalledWith(
    [{ categoria: "empresa", clave: "nombre", valor: "Borrador" }], expect.anything(),
  );
  act(() => result.current.recargarGuardada());
  expect(result.current.s).toMatchObject({ nombre: "Guardado", email: "otro@example.invalid" });
  expect(result.current.isDirty).toBe(false);
  act(() => result.current.set("nombre")("Borrador A"));
  mock.orgId = "org-b";
  mock.data = [{ categoria: "empresa", clave: "nombre", valor: "Empresa B" }];
  rerender();
  expect(result.current.s.nombre).toBe("Empresa B");
  expect(result.current.isDirty).toBe(false);
});

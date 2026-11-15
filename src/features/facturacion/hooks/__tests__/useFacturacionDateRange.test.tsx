import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import React from "react";
import { useFacturacionDateRange } from "../useFacturacionDateRange";

function makeWrapper(initialEntries: string[] = ["/"]) {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
}

describe("useFacturacionDateRange", () => {
  it("sin QP devuelve rango vacío y activo=false", () => {
    const { result } = renderHook(() => useFacturacionDateRange(), {
      wrapper: makeWrapper(),
    });
    expect(result.current.range.desde).toBeNull();
    expect(result.current.range.hasta).toBeNull();
    expect(result.current.activo).toBe(false);
    expect(result.current.isInRange("2024-01-15")).toBe(true);
  });

  it("isInRange filtra correctamente con QP explícitos", () => {
    const { result } = renderHook(() => useFacturacionDateRange(), {
      wrapper: makeWrapper(["/?desde=2024-01-01&hasta=2024-01-31"]),
    });
    expect(result.current.isInRange("2024-01-15")).toBe(true);
    expect(result.current.isInRange("2024-02-01")).toBe(false);
    expect(result.current.isInRange(null)).toBe(false);
  });

  it("setRango actualiza desdeIso y hastaIso", () => {
    const { result } = renderHook(() => useFacturacionDateRange(), {
      wrapper: makeWrapper(),
    });
    act(() => {
      result.current.setRango({ desde: new Date("2024-03-01"), hasta: new Date("2024-03-31") });
    });
    expect(result.current.desdeIso).toBe("2024-03-01");
    expect(result.current.hastaIso).toBe("2024-03-31");
  });
});


it("cambiar el periodo reinicia página en la misma URL sin perder búsqueda o cliente", () => {
  const { result } = renderHook(() => ({ rango: useFacturacionDateRange(), location: useLocation() }), {
    wrapper: makeWrapper(["/?page=4&q=F-123&cliente=ACME&estado=Emitida&ps=50"]),
  });
  act(() => result.current.rango.setRango({ desde: new Date("2026-10-01"), hasta: new Date("2026-10-31") }));
  const params = new URLSearchParams(result.current.location.search);
  expect(params.has("page")).toBe(false);
  expect(params.get("q")).toBe("F-123");
  expect(params.get("cliente")).toBe("ACME");
  expect(params.get("estado")).toBe("Emitida");
  expect(params.get("desde")).toBe("2026-10-01");
  expect(params.get("hasta")).toBe("2026-10-31");
});

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalSearch } from "../GlobalSearch";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/hooks/shared", async () => ({
  useGlobalSearch: (await import("@/features/search/hooks/useGlobalSearch")).useGlobalSearch,
  useRecentPages: () => ({ recents: [] }),
}));
vi.mock("@/lib/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveRole: "admin" }) }));
vi.mock("@/services/observability", () => ({ trackNavEvent: vi.fn() }));

it("ofrece un reintento con el mismo término y da nombres en español a los controles", async () => {
  mocks.rpc
    .mockResolvedValueOnce({ data: null, error: { message: "Falla de lectura", code: "PGRST000" } })
    .mockResolvedValueOnce({
      data: [{ id: "e1", label: "Expediente de prueba", tipo: "embarque", url: "/embarques/e1" }],
      error: null,
    });
  render(<MemoryRouter><TooltipProvider><GlobalSearch /></TooltipProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Abrir búsqueda global" }));
  const input = screen.getByRole("combobox", { name: "Buscar en LibreCarga" });
  expect(screen.getByRole("listbox", { name: "Resultados de búsqueda" })).toBeVisible();

  fireEvent.change(input, { target: { value: "qa-unico" } });
  const reintentar = await screen.findByRole("button", { name: "Reintentar búsqueda" });
  expect(screen.getByRole("alert")).toHaveTextContent("No pudimos completar la búsqueda");
  expect(screen.queryByText("No se encontraron resultados")).toBeNull();
  fireEvent.click(reintentar);

  expect(await screen.findByRole("option", { name: "Expediente de prueba" })).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(input).toHaveValue("qa-unico");
  expect(mocks.rpc.mock.calls).toEqual([
    ["busqueda_global", { termino: "qa-unico", limite: 5 }],
    ["busqueda_global", { termino: "qa-unico", limite: 5 }],
  ]);
});

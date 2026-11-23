import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GlobalSearch } from "../GlobalSearch";

const mocks = vi.hoisted(() => ({ buscar: vi.fn() }));
vi.mock("@/hooks/shared", () => ({
  useGlobalSearch: () => mocks.buscar,
  useRecentPages: () => ({ recents: [] }),
}));
vi.mock("@/lib/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveRole: "admin" }) }));
vi.mock("@/services/observability", () => ({ trackNavEvent: vi.fn() }));

it("ofrece un reintento con el mismo término y da nombres en español a los controles", async () => {
  let intentos = 0;
  mocks.buscar.mockImplementation(async (termino: string) => {
    if (!termino) return [];
    if (++intentos === 1) throw new Error("Falla de lectura");
    return [{ id: "e1", label: "Expediente de prueba", type: "embarque", url: "/embarques/e1" }];
  });
  render(<MemoryRouter><TooltipProvider><GlobalSearch /></TooltipProvider></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Abrir búsqueda global" }));
  const input = screen.getByRole("combobox", { name: "Buscar en LibreCarga" });
  expect(screen.getByRole("listbox", { name: "Resultados de búsqueda" })).toBeVisible();

  fireEvent.change(input, { target: { value: "qa-unico" } });
  fireEvent.click(await screen.findByRole("button", { name: "Reintentar búsqueda" }));
  expect(await screen.findByRole("option", { name: "Expediente de prueba" })).toBeVisible();
  expect(input).toHaveValue("qa-unico");
  expect(mocks.buscar.mock.calls.filter(([termino]) => termino === "qa-unico")).toHaveLength(2);
});

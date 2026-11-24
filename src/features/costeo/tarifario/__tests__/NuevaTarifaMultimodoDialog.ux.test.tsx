import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NuevaTarifaMultimodoDialog } from "../multimodo/NuevaTarifaMultimodoDialog";
import type { TarifaMultimodoForm } from "@/features/costeo/domain/tarifaMultimodo";

const estado = vi.hoisted(() => ({
  guardar: vi.fn(),
  refetch: vi.fn(),
  catalogo: { data: [{ id: "a1", nombre: "Agente de prueba" }], isError: false, isLoading: false, isFetching: false },
}));
vi.mock("@/lib/contexts/OrganizationContext", () => ({ useOrganization: () => ({ organizationId: "org-prueba" }) }));
vi.mock("@/features/costeo/hooks/useCosteoAgentes", () => ({
  useCosteoAgentes: () => ({ ...estado.catalogo, refetch: estado.refetch }),
}));
vi.mock("@/features/costeo/services/tarifas/crearMultimodo", () => ({ crearTarifaMultimodo: estado.guardar }));

function mostrar(inicial?: Partial<TarifaMultimodoForm>) {
  const client = new QueryClient();
  const onOpenChange = vi.fn();
  render(<QueryClientProvider client={client}>
    <NuevaTarifaMultimodoDialog open onOpenChange={onOpenChange} inicial={inicial} />
  </QueryClientProvider>);
  return onOpenChange;
}

async function elegir(label: RegExp, opcion: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: label }), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: opcion }));
}

beforeEach(() => {
  estado.guardar.mockReset();
  estado.refetch.mockReset();
  estado.catalogo = { data: [{ id: "a1", nombre: "Agente de prueba" }], isError: false, isLoading: false, isFetching: false };
});

describe("alta de tarifas aéreas o terrestres", () => {
  it("separa recargos locales en MXN e internacionales en USD", () => {
    mostrar();
    fireEvent.click(screen.getByRole("button", { name: "Agregar recargo local" }));
    expect(screen.getByRole("textbox", { name: "Monto del recargo 1 en MXN" })).toBeVisible();
    expect(screen.getByText("+ IVA")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Agregar recargo internacional" }));
    expect(screen.getByRole("textbox", { name: "Monto del recargo 2 en USD" })).toBeVisible();
    expect(screen.getByText("+ VAT")).toBeVisible();
  });

  it("pregunta antes de descartar captura y conserva agente y moneda al cambiar", async () => {
    mostrar({ agente_id: "a1", moneda: "MXN" });
    fireEvent.change(screen.getByRole("textbox", { name: /Aeropuerto de origen/ }), { target: { value: "MEX" } });
    await elegir(/Modo/, "Terrestre");
    const confirmar = () => within(screen.getByRole("alertdialog", { name: "¿Cambiar el modo a Terrestre?" }));
    fireEvent.click(confirmar().getByRole("button", { name: "Conservar captura" }));
    expect(screen.getByRole("textbox", { name: /Aeropuerto de origen/ })).toHaveValue("MEX");
    await elegir(/Modo/, "Terrestre");
    fireEvent.click(confirmar().getByRole("button", { name: "Cambiar modo" }));
    expect(screen.getByRole("textbox", { name: /Origen/ })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: /Agente/ })).toHaveTextContent("Agente de prueba");
    expect(screen.getByRole("combobox", { name: /Moneda/ })).toHaveTextContent("MXN");
  });

  it("pide confirmar al cancelar una captura y bloquea Cancelar durante el guardado", async () => {
    let resolver!: () => void;
    estado.guardar.mockImplementation(() => new Promise<void>((resolve) => { resolver = resolve; }));
    const onOpenChange = mostrar({
      agente_id: "a1", origen: "MEX", destino: "LAX", flete_base: 20,
      vigente_desde: "2026-11-20", vigente_hasta: "2026-12-20",
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: /Precio base por kg/ }), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    const descarte = screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" });
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(within(descarte).getByRole("button", { name: "Seguir capturando" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled());
    expect(onOpenChange).not.toHaveBeenCalled();
    await act(async () => resolver());
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("nombra las dos fechas y localiza todos los tramos repetidos", () => {
    mostrar({ moneda: "MXN", tramos: [{ desde_kg: 100, precio: 20 }, { desde_kg: 100, precio: 30 }] });
    expect(screen.getByRole("textbox", { name: "Vigente desde" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Vigente hasta" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Abrir calendario de vigencia desde" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Abrir calendario de vigencia hasta" })).toBeVisible();
    expect(screen.getByText("Precio por kg (MXN)")).toBeVisible();
    const desde = screen.getByRole("spinbutton", { name: "Desde kg, rango 1" });
    const segundo = screen.getByRole("spinbutton", { name: "Desde kg, rango 2" });
    expect(desde).toHaveAccessibleDescription("Ya existe otro rango desde 100 kg.");
    expect(segundo).toHaveAccessibleDescription("Ya existe otro rango desde 100 kg.");
    fireEvent.change(segundo, { target: { value: "120" } });
    expect(desde).not.toHaveAttribute("aria-invalid");
    expect(segundo).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("button", { name: "Quitar rango 2 (desde 120 kg)" })).toBeVisible();
  });
});

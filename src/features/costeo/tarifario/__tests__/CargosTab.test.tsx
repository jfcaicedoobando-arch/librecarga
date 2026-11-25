import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CargosTab } from "../CargosTab";
import { archivarCargo, listarCargos } from "../cargosService";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";

vi.mock("../cargosService", () => ({ listarCargos: vi.fn(), archivarCargo: vi.fn() }));
vi.mock("../CargoFormDialog", () => ({ CargoFormDialog: () => <div>Formulario de cargo</div> }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
const media = vi.hoisted(() => ({ movil: false }));
vi.mock("@/hooks/shared", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/hooks/shared")>(),
  useIsMobile: () => media.movil,
}));
const cargo = { id: "c1", entidad_id: "a1", entidad: { nombre: "Agente uno" }, concepto: "FOB origen", monto: 120, moneda: "USD", unidad: "Por BL", aplica_iva: false };
function setup(puedeEditar = true) {
  vi.mocked(listarCargos).mockResolvedValue([cargo]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={client}><CargosTab tipo="fob" orgId="org" puedeEditar={puedeEditar} /></QueryClientProvider></MemoryRouter>);
}

describe("CargosTab canonical table", () => {
  beforeEach(() => { vi.clearAllMocks(); media.movil = false; });

  it("conserva lectura y edición del cargo", async () => {
    setup();
    expect(await screen.findByText("Agente uno")).toBeInTheDocument();
    expect(screen.getByText("FOB origen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByText("Formulario de cargo")).toBeInTheDocument();
  });
  it("conserva el retiro recuperable y confirma éxito", async () => {
    vi.mocked(archivarCargo).mockResolvedValue();
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Retirar" }));
    const dialogo = screen.getByRole("alertdialog", { name: "¿Retirar este cargo del tarifario?" });
    expect(dialogo).toHaveTextContent("FOB origen");
    expect(dialogo).toHaveTextContent("Agente uno");
    expect(archivarCargo).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Retirar cargo" }));
    await waitFor(() => expect(archivarCargo).toHaveBeenCalledWith("fob", "c1"));
    expect(notifySuccess).toHaveBeenCalledWith(undefined, { title: "Cargo retirado" });
  });
  it("cancelar la confirmación conserva el cargo", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Retirar" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));
    expect(archivarCargo).not.toHaveBeenCalled();
    expect(screen.getByText("FOB origen")).toBeVisible();
  });
  it("preserva el error original en diagnóstico", async () => {
    const error = new Error("denied");
    vi.mocked(archivarCargo).mockRejectedValue(error);
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Retirar" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Retirar cargo" }));
    await waitFor(() => expect(notifyError).toHaveBeenCalledWith(undefined, expect.objectContaining({ error, method: "archivarCargo" })));
  });
  it("no muestra edición ni retiro para lectores", async () => {
    setup(false);
    await screen.findByText("Agente uno");
    expect(screen.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retirar" })).not.toBeInTheDocument();
  });

  it("muestra la misma información en una tarjeta móvil con acciones según el permiso", async () => {
    media.movil = true;
    setup(false);
    const vista = within(await screen.findByRole("article"));
    expect(vista.getByText("FOB origen")).toBeVisible();
    expect(vista.getByText("Agente: Agente uno")).toBeVisible();
    expect(vista.getByText("USD 120.00")).toBeVisible();
    expect(vista.getByText("Por BL")).toBeVisible();
    expect(vista.queryByRole("button", { name: "Editar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

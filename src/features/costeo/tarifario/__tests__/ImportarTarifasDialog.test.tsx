import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ImportarTarifasDialog } from "../ImportarTarifasDialog";

const mock = vi.hoisted(() => ({
  preparar: vi.fn(),
  crear: vi.fn(),
  exportar: vi.fn(),
}));
vi.mock("@/lib/contexts/OrganizationContext", () => ({ useOrganization: () => ({ organizationId: "org-qa" }) }));
vi.mock("@/features/catalogos/services", () => ({
  fetchPuertos: async () => [],
  fetchNavieras: async () => [],
  fetchTiposContenedor: async () => [],
}));
vi.mock("@/features/costeo/services/agentes", () => ({ fetchCosteoAgentes: async () => [] }));
vi.mock("@/features/costeo/services/rutas", () => ({ fetchCosteoRutas: async () => [], insertCosteoRuta: vi.fn() }));
vi.mock("@/features/costeo/services/tarifas", () => ({ insertTarifaConRecargos: mock.crear }));
vi.mock("@/lib/xlsx/readWorkbook", () => ({ readWorkbook: vi.fn() }));
vi.mock("@/generators/exportCsv", () => ({ exportToCsv: mock.exportar }));
vi.mock("../importarTarifas", () => ({ prepararImportacion: mock.preparar }));

it("ofrece plantilla sin tarifas y conserva el diálogo durante una importación parcial", async () => {
  const onOpenChange = vi.fn();
  const onDone = vi.fn();
  render(<ImportarTarifasDialog open onOpenChange={onOpenChange} onDone={onDone} />);
  fireEvent.click(screen.getByRole("button", { name: "Descargar plantilla CSV" }));
  expect(mock.exportar).toHaveBeenCalledWith("plantilla-tarifas.csv", expect.arrayContaining([
    { key: "origen", label: "Origen" }, { key: "destino", label: "Destino" },
  ]), []);

  mock.preparar.mockReturnValue({
    tarifas: [{ input: { ruta_id: "ruta-qa" }, fila: 2 }],
    errores: ["Fila 3: origen inválido"],
  });
  let finalizar!: () => void;
  mock.crear.mockReturnValueOnce(new Promise<void>((resolve) => { finalizar = resolve; }));
  const archivo = new File(["Origen,Destino"], "tarifas.csv", { type: "text/csv" });
  Object.defineProperty(archivo, "arrayBuffer", { value: async () => new ArrayBuffer(0) });
  fireEvent.change(screen.getByLabelText("Archivo de tarifas"), { target: { files: [archivo] } });
  fireEvent.click(await screen.findByRole("button", { name: /Importar 1 tarifa/ }));
  await waitFor(() => expect(mock.crear).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("status")).toHaveTextContent("Procesadas 0 de 1 tarifas.");
  const cerrar = screen.getAllByRole("button", { name: "Cerrar" });
  expect(cerrar.find((boton) => boton.matches(":disabled"))).toBeDefined();
  cerrar.forEach((boton) => fireEvent.click(boton));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onOpenChange).not.toHaveBeenCalled();

  await act(async () => { finalizar(); });
  expect(screen.getByRole("status")).toHaveTextContent("Tarifas importadas: 1. Filas con error: 1.");
  expect(screen.getByText("Fila 3: origen inválido")).toBeVisible();
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(mock.crear).toHaveBeenCalledTimes(1);
});

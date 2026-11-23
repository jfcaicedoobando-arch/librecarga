import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test/utils/queryWrapper";
import { exportToCsv } from "@/generators/exportCsv";
import { TarifasBaseTab } from "../TarifasBaseTab";
import { listarTarifasTarifario, type TarifaTarifario } from "../tarifarioService";

vi.mock("@/generators/exportCsv", () => ({ exportToCsv: vi.fn() }));
vi.mock("../tarifarioService", async (importOriginal) => ({
  ...await importOriginal<typeof import("../tarifarioService")>(),
  listarTarifasTarifario: vi.fn(),
}));

const base: TarifaTarifario = {
  id: "usd", flete_base: 500, moneda: "USD", dias_libres_demoras: null, vigente_desde: null, vigente_hasta: null,
  notas: null, solicitud_pricing_id: null, agente: null, naviera: null, tipo: { code: "20STD" },
  ruta: { origen: { name: "Origen QA" }, destino: { name: "Destino QA" } },
};

describe("Moneda original del tarifario", () => {
  it("distingue las monedas de 20 y 40 pies en pantalla y CSV", async () => {
    vi.mocked(listarTarifasTarifario).mockResolvedValue([
      base,
      { ...base, id: "eur", flete_base: 700, moneda: "EUR", tipo: { code: "40STD" } },
    ]);
    render(<TarifasBaseTab puedeEditar={false} />, { wrapper: createWrapper() });
    const fila = (await screen.findByText("Origen QA")).closest("tr")!;
    expect(within(fila).getByText("USD", { exact: true })).toBeInTheDocument();
    expect(within(fila).getByText("EUR", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: 'Moneda 40"' })).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: /\(USD\)/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Descargar CSV" }));
    expect(exportToCsv).toHaveBeenCalledWith(
      expect.stringMatching(/\.csv$/),
      expect.arrayContaining([
        { key: "moneda20", label: 'Moneda 20"' },
        { key: "moneda40", label: 'Moneda 40"' },
      ]),
      [expect.objectContaining({ t20: 500, moneda20: "USD", t40: 700, moneda40: "EUR" })],
    );
  });

  it("permite localizar los tipos fuera del comparativo en el catálogo de su ruta", async () => {
    const ruta = "4a74ea99-a0f5-46cf-80b4-3c45e50d9a26";
    vi.mocked(listarTarifasTarifario).mockResolvedValue([
      { ...base, tipo: { code: "45HC" }, ruta: { id: ruta, origen: { name: "Ningbo" }, destino: { name: "Manzanillo" } } },
    ]);
    render(<MemoryRouter><TarifasBaseTab puedeEditar={false} /></MemoryRouter>, { wrapper: createWrapper() });
    const enlace = await screen.findByRole("link", { name: "Otras tarifas en el catálogo: 1" });
    expect(enlace).toHaveAttribute("href", `/costeo/tarifas?ruta=${ruta}`);
  });
});

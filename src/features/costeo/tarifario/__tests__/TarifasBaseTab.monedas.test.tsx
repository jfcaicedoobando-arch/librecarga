import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test/utils/queryWrapper";
import { exportToCsv } from "@/generators/exportCsv";
import { TarifasBaseTab } from "../TarifasBaseTab";
import { listarTarifasTarifario, type TarifaTarifario } from "../tarifarioService";

vi.mock("@/generators/exportCsv", () => ({ exportToCsv: vi.fn() }));
vi.mock("@/features/costeo/components/TarifaForm", () => ({
  TarifaForm: () => <div role="dialog" aria-label="Alta de tarifa" />,
}));
vi.mock("../ImportarTarifasDialog", () => ({
  ImportarTarifasDialog: ({ onOpenChange }: { onOpenChange: (open: boolean) => void }) => (
    <div role="dialog" aria-label="Importar tarifas">
      <button type="button" onClick={() => onOpenChange(false)}>Cerrar importación</button>
    </div>
  ),
}));
const media = vi.hoisted(() => ({ movil: false }));
vi.mock("@/hooks/shared", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/hooks/shared")>(),
  useIsMobile: () => media.movil,
}));
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
  beforeEach(() => { vi.clearAllMocks(); media.movil = false; });

  it("distingue las monedas de 20 y 40 pies en pantalla y CSV", async () => {
    vi.mocked(listarTarifasTarifario).mockResolvedValue([
      base,
      { ...base, id: "eur", flete_base: 700, moneda: "EUR", tipo: { code: "40STD" } },
    ]);
    render(<MemoryRouter><TarifasBaseTab puedeEditar={false} /></MemoryRouter>, { wrapper: createWrapper() });
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

  it("resume ruta, vigencia y montos por moneda en móvil, mantiene vigencia y búsqueda", async () => {
    media.movil = true;
    const conVigencia = { ...base, vigente_desde: "2026-10-01", vigente_hasta: "2026-10-31" };
    vi.mocked(listarTarifasTarifario).mockResolvedValueOnce([
      conVigencia,
      { ...conVigencia, id: "eur", flete_base: 700, moneda: "EUR", tipo: { code: "40STD" } },
    ]).mockResolvedValueOnce([]);
    render(<MemoryRouter><TarifasBaseTab puedeEditar={false} /></MemoryRouter>, { wrapper: createWrapper() });
    const ficha = within(await screen.findByRole("article"));
    expect(ficha.getByText("Origen QA")).toBeVisible();
    expect(ficha.getByText("Destino QA")).toBeVisible();
    expect(ficha.getByText("01/10/2026")).toBeVisible();
    expect(ficha.getByText("31/10/2026")).toBeVisible();
    expect(ficha.getByText("USD 500.00")).toBeVisible();
    expect(ficha.getByText("EUR 700.00")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: /Buscar origen/ }), { target: { value: "sin coincidencia" } });
    expect(screen.getByText("Ninguna tarifa coincide con esta búsqueda.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    expect(screen.getByRole("article")).toBeVisible();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Filtrar por vigencia" }), { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("option", { name: "Vencidas" }), { key: "Enter" });
    expect(await screen.findByText("Sin tarifas vencidas.")).toBeVisible();
    expect(listarTarifasTarifario).toHaveBeenLastCalledWith("vencidas", expect.any(String));
  });

  it("conserva un grupo y muestra sus rutas aéreas y terrestres con unidad de flete", async () => {
    media.movil = true;
    const sinPuertos = { ...base, tipo: null, ruta: null };
    vi.mocked(listarTarifasTarifario).mockResolvedValue([
      { ...sinPuertos, id: "aerea", modo: "Aéreo", aeropuerto_origen: "JFK", aeropuerto_destino: "MEX", unidad_flete: "kg" },
      { ...sinPuertos, id: "terrestre", modo: "Terrestre", origen_ciudad: "Guadalajara", destino_cp: "06000", unidad_flete: "viaje", moneda: "MXN" },
    ]);
    render(<MemoryRouter><TarifasBaseTab puedeEditar={false} /></MemoryRouter>, { wrapper: createWrapper() });
    const ficha = within(await screen.findByRole("article"));
    for (const texto of ["JFK", "MEX", "Guadalajara", "06000", "USD 500.00 / kg", "MXN 500.00 / viaje"]) {
      expect(ficha.getByText(texto)).toBeVisible();
    }
    fireEvent.change(screen.getByRole("textbox", { name: /Buscar origen/ }), { target: { value: "jfk" } });
    expect(screen.getByRole("article")).toBeVisible();
  });

  it("deja el alta visible y permite las acciones secundarias desde el menú móvil", async () => {
    media.movil = true;
    vi.mocked(listarTarifasTarifario).mockResolvedValue([base]);
    render(<MemoryRouter><TarifasBaseTab puedeEditar /></MemoryRouter>, { wrapper: createWrapper() });
    await screen.findByRole("article");
    expect(screen.getByRole("button", { name: "Nueva tarifa" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Descargar CSV" })).not.toBeInTheDocument();
    const menu = screen.getByRole("button", { name: "Más acciones del tarifario" });
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(await screen.findByRole("menuitem", { name: "Extraer de correo" })).toBeVisible();
    fireEvent.click(screen.getByRole("menuitem", { name: "Descargar CSV" }));
    expect(exportToCsv).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("menuitem", { name: "Importar CSV/Excel" }), { key: "Enter" });
    expect(await screen.findByRole("dialog", { name: "Importar tarifas" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar importación" }));
    fireEvent.click(screen.getByRole("button", { name: "Nueva tarifa" }));
    expect(screen.getByRole("dialog", { name: "Alta de tarifa" })).toBeVisible();
  });

  it("permite ordenar las tarjetas en móvil sin dar acciones de edición al lector", async () => {
    media.movil = true;
    vi.mocked(listarTarifasTarifario).mockResolvedValue([
      { ...base, ruta: { origen: { name: "Zaragoza" }, destino: { name: "Destino" } } },
      { ...base, id: "otro", ruta: { origen: { name: "Acapulco" }, destino: { name: "Destino" } } },
    ]);
    render(<MemoryRouter><TarifasBaseTab puedeEditar={false} /></MemoryRouter>, { wrapper: createWrapper() });
    expect((await screen.findAllByRole("article"))[0]).toHaveTextContent("Zaragoza");
    expect(screen.queryByRole("button", { name: "Nueva tarifa" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: "Más acciones del tarifario" }), { key: "ArrowDown" });
    const ordenar = await screen.findByRole("menuitem", { name: "Ordenar por" });
    expect(screen.queryByRole("menuitem", { name: "Importar CSV/Excel" })).not.toBeInTheDocument();
    fireEvent.keyDown(ordenar, { key: "ArrowRight" });
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Origen" }));
    expect(screen.getAllByRole("article")[0]).toHaveTextContent("Acapulco");
  });
});

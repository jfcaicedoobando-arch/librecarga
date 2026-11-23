import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TabCaptura } from "../TabCaptura";

const mocks = vi.hoisted(() => ({
  categorias: vi.fn(),
  mensual: vi.fn(),
  guardar: vi.fn(),
  refetchCategorias: vi.fn(),
  refetchMensual: vi.fn(),
}));

vi.mock("@/lib/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "usuario" } }) }));
vi.mock("@/lib/contexts/OrganizationContext", () => ({ useOrganization: () => ({ organizationId: "org" }) }));
vi.mock("@/features/presupuesto/hooks", () => ({
  usePresupuestoCategorias: mocks.categorias,
  usePresupuestoMensualAnio: mocks.mensual,
  useUpsertCeldaPresupuesto: () => ({ mutateAsync: mocks.guardar }),
}));

const captura = <TabCaptura anio={2026} onAnioChange={() => {}} />;
const categorias = { data: [{ id: "renta", nombre: "Renta" }], refetch: mocks.refetchCategorias };
const mensual = { data: [], refetch: mocks.refetchMensual };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.categorias.mockReturnValue(categorias);
  mocks.mensual.mockReturnValue(mensual);
  mocks.guardar.mockResolvedValue(undefined);
});

describe("captura de presupuesto", () => {
  it("omite una celda sin editar y guarda un cero escrito de forma explícita", async () => {
    render(captura);
    const celda = screen.getByRole("spinbutton", { name: "Monto de Renta para 2026-01" });
    expect(celda).toHaveValue(null);
    fireEvent.focus(celda);
    fireEvent.blur(celda);
    expect(mocks.guardar).not.toHaveBeenCalled();

    fireEvent.change(celda, { target: { value: "0" } });
    await act(async () => { fireEvent.blur(celda); });
    expect(mocks.guardar).toHaveBeenCalledExactlyOnceWith({
      categoria_id: "renta", periodo: "2026-01", monto_mxn: 0,
      organization_id: "org", creado_por: "usuario",
    });
  });

  it("muestra el cero capturado y omite un cambio que se revierte a vacío antes de salir", () => {
    mocks.mensual.mockReturnValue({
      ...mensual, data: [{ categoria_id: "renta", periodo: "2026-01", monto_mxn: 0 }],
    });
    render(captura);
    expect(screen.getByRole("spinbutton", { name: "Monto de Renta para 2026-01" })).toHaveValue(0);
    const febrero = screen.getByRole("spinbutton", { name: "Monto de Renta para 2026-02" });
    fireEvent.change(febrero, { target: { value: "100" } });
    fireEvent.change(febrero, { target: { value: "" } });
    fireEvent.blur(febrero);
    expect(mocks.guardar).not.toHaveBeenCalled();
  });

  it.each(["categorias", "mensual"] as const)("distingue un error de %s de una consulta vacía", (consulta) => {
    const datos = consulta === "categorias" ? categorias : mensual;
    const refetch = datos.refetch;
    const vista = render(captura);
    mocks[consulta].mockReturnValue({ ...datos, data: undefined, isError: true });
    vista.rerender(<TabCaptura anio={2026} onAnioChange={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el presupuesto");
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(consulta === "categorias" ? mocks.refetchMensual : mocks.refetchCategorias).not.toHaveBeenCalled();
    mocks[consulta].mockReturnValue(datos);
    vista.rerender(<TabCaptura anio={2026} onAnioChange={() => {}} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Monto de Renta para 2026-01" })).toHaveValue(null);
  });
});

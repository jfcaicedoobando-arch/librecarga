import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CrmReportes from "../ReportesCrm";

const { listReportes, listTableros } = vi.hoisted(() => ({ listReportes: vi.fn(), listTableros: vi.fn() }));
vi.mock("@/features/crm/services/reportes/reportesCrm", async (original) => ({
  ...await original<typeof import("@/features/crm/services/reportes/reportesCrm")>(),
  listReportes,
  listTableros,
}));
vi.mock("@/hooks/shared", async (original) => ({
  ...await original<typeof import("@/hooks/shared")>(),
  usePermissions: () => ({ isSuperAdmin: false }),
}));

function mostrar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CrmReportes /></QueryClientProvider>);
}

beforeEach(() => {
  listTableros.mockReset().mockResolvedValue([{ id: "ventas", nombre: "Ventas" }, { id: "cuentas", nombre: "Cuentas" }]);
  listReportes.mockReset().mockResolvedValue([]);
});

describe("CRM Reportes y tableros", () => {
  it("distingue carga, error y vacío de tableros con un reintento para la consulta", async () => {
    listTableros.mockRejectedValueOnce(new Error("Falló tableros")).mockResolvedValue([]);
    mostrar();

    expect(screen.getByRole("status")).toHaveTextContent("Cargando tableros");
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los tableros");
    expect(screen.queryByText("Aún no hay tableros")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Aún no hay tableros")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear tablero" })).not.toBeInTheDocument();
    expect(listTableros).toHaveBeenCalledTimes(2);
    expect(listReportes).not.toHaveBeenCalled();
  });

  it("mantiene elegible el tablero durante un fallo del reporte y reintenta el que está seleccionado", async () => {
    const consultarCuentas = vi.fn().mockRejectedValueOnce(new Error("Falló Cuentas")).mockResolvedValue([]);
    listReportes.mockImplementation((id: string) => id === "cuentas" ? consultarCuentas() : Promise.resolve([]));
    mostrar();

    expect(await screen.findByText("Este tablero no tiene reportes")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Cuentas" }), { key: "Enter" });
    expect(screen.getByRole("status")).toHaveTextContent("Cargando reportes");
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar los reportes de este tablero");
    expect(screen.getByRole("tab", { name: "Ventas" })).toBeEnabled();
    expect(screen.getByRole("tab", { name: "Cuentas" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Este tablero no tiene reportes")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Este tablero no tiene reportes")).toBeInTheDocument();
    expect(consultarCuentas).toHaveBeenCalledTimes(2);
    expect(listTableros).toHaveBeenCalledOnce();
  });
});

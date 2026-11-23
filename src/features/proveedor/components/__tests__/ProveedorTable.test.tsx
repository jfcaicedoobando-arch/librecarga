import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test/utils/queryWrapper";
import { ProveedorTable } from "../ProveedorTable";

const consulta = vi.hoisted(() => ({ useProveedoresPaginados: vi.fn() }));
vi.mock("@/features/proveedor/hooks", () => consulta);

describe("ProveedorTable", () => {
  it("reintenta un error con los filtros actuales y explica un vacío de los filtros", () => {
    const refetch = vi.fn();
    const onTotalChange = vi.fn();
    const limpiar = vi.fn();
    consulta.useProveedoresPaginados.mockReturnValue({ isError: true, refetch });
    const vista = () => (
      <MemoryRouter>
        <ProveedorTable origen="Nacional" search="" onSelect={vi.fn()} onTotalChange={onTotalChange}
          onLimpiarFiltros={limpiar} canCreate onCreateNew={vi.fn()} />
      </MemoryRouter>
    );
    const { rerender } = render(vista(), { wrapper: createWrapper() });
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar el directorio de proveedores");
    expect(screen.queryByRole("button", { name: "Crear proveedor" })).not.toBeInTheDocument();
    expect(onTotalChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(consulta.useProveedoresPaginados).toHaveBeenLastCalledWith(expect.objectContaining({ origen: "Nacional" }));

    consulta.useProveedoresPaginados.mockReturnValue({ isError: false, data: { data: [], count: 0 } });
    rerender(vista());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Sin proveedores con estos filtros")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Crear proveedor" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(limpiar).toHaveBeenCalledOnce();
    expect(onTotalChange).toHaveBeenCalledWith(0);
  });

  it("ofrece crear el primer proveedor sólo con un directorio vacío y sin filtros", () => {
    const crear = vi.fn();
    consulta.useProveedoresPaginados.mockReturnValue({ data: { data: [], count: 0 } });
    render(
      <MemoryRouter>
        <ProveedorTable origen="todos" search="" onSelect={vi.fn()} onLimpiarFiltros={vi.fn()} canCreate onCreateNew={crear} />
      </MemoryRouter>,
      { wrapper: createWrapper() },
    );
    expect(screen.getByText("Aún no hay proveedores")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).toBeNull();
    fireEvent.click(screen.getByText("Crear proveedor", { selector: "button" }));
    expect(crear).toHaveBeenCalledOnce();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { createWrapper } from "@/test/utils/queryWrapper";
import { ProveedorTable } from "../ProveedorTable";

const consulta = vi.hoisted(() => ({ useProveedoresPaginados: vi.fn() }));
vi.mock("@/features/proveedor/hooks", () => consulta);

describe("ProveedorTable", () => {
  it("permite reintentar un error con los filtros actuales y ofrece crear sólo tras cargar un vacío real", () => {
    const refetch = vi.fn();
    const onTotalChange = vi.fn();
    consulta.useProveedoresPaginados.mockReturnValue({ isError: true, refetch });
    const vista = () => (
      <MemoryRouter>
        <ProveedorTable origen="Nacional" search="" onSelect={vi.fn()} onTotalChange={onTotalChange}
          canCreate onCreateNew={vi.fn()} />
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
    expect(screen.getByText("Crear proveedor", { selector: "button" })).toBeInTheDocument();
    expect(onTotalChange).toHaveBeenCalledWith(0);
  });
});

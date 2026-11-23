import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProductoServicioSelect } from "../ProductoServicioSelect";

const mocks = vi.hoisted(() => ({ consultar: vi.fn() }));
vi.mock("@/features/cotizacion/hooks/useProductosCatalogo", () => ({
  useProductosCatalogo: mocks.consultar,
}));
vi.mock("@/lib/contexts/AuthContext", () => ({ useAuth: () => ({ role: "vendedor" }) }));
vi.mock("@/hooks/shared/useOrgActiva", () => ({ useOrgActiva: () => ({ organizationId: "org" }) }));
vi.mock("@/features/configuracion/hooks/useIvaFrontera", () => ({ useIvaFronteraHabilitada: () => false }));
vi.mock("../CrearConceptoInlineForm", () => ({ CrearConceptoInlineForm: () => null }));

it("distingue error y vacío de catálogo con permisos de lectura", () => {
  const refetch = vi.fn();
  mocks.consultar.mockReturnValue({ productos: [], porNombre: new Map(), isError: true, refetch });
  const onSelect = vi.fn();
  const { rerender } = render(<ProductoServicioSelect value="" onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("combobox"));
  expect(screen.getByRole("alert")).toHaveTextContent("No se pudo consultar el catálogo");
  expect(screen.queryByText(/No hay productos activos/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(refetch).toHaveBeenCalledOnce();

  mocks.consultar.mockReturnValue({ productos: [], porNombre: new Map(), isError: false, refetch });
  rerender(<ProductoServicioSelect value="" onSelect={onSelect} />);
  expect(screen.getByText("No hay productos activos en el catálogo.")).toBeVisible();
  expect(screen.queryByText(/Da de alta productos/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Crear concepto" })).not.toBeInTheDocument();
});

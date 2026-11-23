import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import EditarCotizacion from "../EditarCotizacion";

const { costos, cotizacion, montarEditor } = vi.hoisted(() => ({
  costos: vi.fn(),
  cotizacion: vi.fn(),
  montarEditor: vi.fn(),
}));

vi.mock("@/hooks/shared", () => ({
  usePermissions: () => ({ canWriteCotizaciones: true }),
  useToast: () => ({ toast: vi.fn() }),
  useRegistrarActividad: () => ({}),
}));
vi.mock("@/lib/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/contexts/BreadcrumbContext", () => ({ useRegisterBreadcrumbLabel: vi.fn() }));
vi.mock("@/features/cliente/hooks", () => ({ useClientesForSelect: () => ({ data: [] }) }));
vi.mock("@/features/cotizacion/hooks", () => ({
  useCotizacion: cotizacion,
  useCotizacionCostos: costos,
  useUpdateCotizacion: () => ({}),
  useCreateCotizacion: () => ({}),
  useUpsertCotizacionCostos: () => ({}),
  useCotizacionWizardForm: montarEditor,
}));
vi.mock("@/features/cotizacion/components/CotizacionWizardLayout", () => ({
  default: () => <div>Editor de cotización<input aria-label="Captura pendiente" /></div>,
}));

const route = () => (
  <MemoryRouter initialEntries={["/cotizaciones/cot-qa/editar"]}>
    <Routes><Route path="/cotizaciones/:id/editar" element={<EditarCotizacion />} /></Routes>
  </MemoryRouter>
);

describe("Editar cotización · carga de costos", () => {
  it.each([[{ id: "costo-existente" }], []].map((rows) => ({ rows })))(
    "sólo monta el editor después de recibir las partidas (%j)",
    ({ rows }) => {
      montarEditor.mockClear();
      cotizacion.mockReturnValue({ data: { id: "cot-qa", folio: "QA", estado: "Borrador" } });
      const refetch = vi.fn();
      costos.mockReturnValue({ data: undefined, isError: true, refetch });
      const view = render(route());
      expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar los costos de la cotización");
      expect(montarEditor).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
      expect(refetch).toHaveBeenCalledOnce();

      costos.mockReturnValue({ data: rows, refetch });
      view.rerender(route());
      expect(screen.getByText("Editor de cotización")).toBeVisible();
      expect(montarEditor).toHaveBeenLastCalledWith(expect.objectContaining({ initialCostos: rows }));
    },
  );

  it("permite reintentar una actualización fallida conservando el editor y la captura", () => {
    const rows = [{ id: "costo-existente" }];
    const refetch = vi.fn();
    cotizacion.mockReturnValue({ data: { id: "cot-qa", folio: "QA", estado: "Borrador" } });
    costos.mockReturnValue({ data: rows, refetch });
    const view = render(route());
    const captura = screen.getByRole("textbox", { name: "Captura pendiente" });
    fireEvent.change(captura, { target: { value: "Borrador en curso" } });

    costos.mockReturnValue({ data: rows, isRefetchError: true, refetch });
    view.rerender(route());
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos actualizar los costos");
    expect(captura).toBeVisible();
    expect(captura).toHaveValue("Borrador en curso");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();

    costos.mockReturnValue({ data: rows, isRefetchError: true, isFetching: true, refetch });
    view.rerender(route());
    expect(screen.getByRole("button", { name: "Reintentando…" })).toBeDisabled();
    costos.mockReturnValue({ data: [{ id: "costo-actualizado" }], refetch });
    view.rerender(route());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(captura).toBeVisible();
    expect(captura).toHaveValue("Borrador en curso");
  });
});

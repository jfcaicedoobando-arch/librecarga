import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConceptosFacturaSection } from "../ConceptosFacturaSection";
import { VincularEmbarqueSection } from "../VincularEmbarqueSection";
import { AnticiposAplicadosSection } from "@/features/anticipos-proveedor/components/AnticiposAplicadosSection";
import { calcularTopeVinculacion } from "@/features/cxp/utils/topeVinculacion";

const { conceptos, costos, anticipos, refetch } = vi.hoisted(() => ({
  conceptos: vi.fn(), costos: vi.fn(), anticipos: vi.fn(), refetch: vi.fn(),
}));
vi.mock("@/features/cxp/hooks/useConceptosCfdiFactura", () => ({ useConceptosCfdiFactura: conceptos }));
vi.mock("@/features/cxp/hooks", () => ({
  useConceptosCostoAbiertos: costos,
  useSugerirEmbarquesProveedor: () => ({ data: [] }),
  useBuscarEmbarquesPorTexto: () => ({ data: [] }),
}));
vi.mock("@/features/catalogos/hooks/useTcDofPorFecha", () => ({ useTcDofPorFecha: () => ({ data: null }) }));
vi.mock("@/features/anticipos-proveedor/hooks/useAplicacionesPorFactura", () => ({ useAplicacionesPorFactura: anticipos }));
vi.mock("@/features/cxp/components/EditarConceptosButton", () => ({ EditarConceptosButton: () => null }));

describe("Lecturas de una factura de proveedor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const consulta of [conceptos, costos, anticipos]) {
      consulta.mockReturnValue({ isError: true, refetch });
    }
  });

  it("reserva la sugerencia de adjuntar XML para una consulta exitosa y vacía", () => {
    const vista = <ConceptosFacturaSection facturaId="fac-1" moneda="USD" />;
    const { rerender } = render(vista);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron consultar los conceptos");
    expect(screen.queryByText(/Adjuntar XML/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();
    conceptos.mockReturnValue({ data: [] });
    rerender(<ConceptosFacturaSection facturaId="fac-1" moneda="USD" />);
    expect(screen.getByText(/Adjuntar XML/)).toBeInTheDocument();
  });

  it("ofrece reintentar costos y describe por separado el vínculo manual", () => {
    const props = {
      proveedorId: "p-1", proveedorNombre: "Proveedor", organizationId: "org-1",
      seleccion: {}, onToggle: vi.fn(), onChangeMonto: vi.fn(),
      embarqueAdHoc: null, onEmbarqueAdHoc: vi.fn(), tope: calcularTopeVinculacion(100, {}),
    };
    const { rerender } = render(<VincularEmbarqueSection {...props} />);
    expect(screen.queryByText(/no tiene costos pre-cargados/)).not.toBeInTheDocument();
    expect(screen.getByText("Vincular un embarque manualmente")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();
    costos.mockReturnValue({ data: [] });
    rerender(<VincularEmbarqueSection {...props} />);
    expect(costos).toHaveBeenLastCalledWith("p-1", "org-1");
    expect(screen.getByText(/no tiene costos pre-cargados/)).toBeInTheDocument();
  });

  it("conserva la sección de anticipos y recupera su subtotal en la moneda aplicada", () => {
    const { rerender } = render(<AnticiposAplicadosSection facturaId="fac-1" />);
    expect(screen.getByText("Anticipos aplicados")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron consultar los anticipos aplicados");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();
    anticipos.mockReturnValue({ data: [{ id: "a-1", fecha_aplicacion: "2026-11-23", monto_aplicado: 100, moneda_aplicada: "USD" }] });
    rerender(<AnticiposAplicadosSection facturaId="fac-1" />);
    expect(screen.getByText("Total aplicado en USD")).toBeInTheDocument();
  });
});

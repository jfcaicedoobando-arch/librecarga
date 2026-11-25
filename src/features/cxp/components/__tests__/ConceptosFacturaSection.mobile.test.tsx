import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConceptosFacturaSection } from "../ConceptosFacturaSection";

const { consulta, viewport } = vi.hoisted(() => ({ consulta: vi.fn(), viewport: { mobile: true } }));
vi.mock("@/features/cxp/hooks/useConceptosCfdiFactura", () => ({ useConceptosCfdiFactura: consulta }));
vi.mock("@/features/cxp/components/EditarConceptosButton", () => ({ EditarConceptosButton: () => null }));
vi.mock("@/hooks/shared/useIsMobile", () => ({ useIsMobile: () => viewport.mobile }));

const descripcion = "Transporte de equipo de carga y maniobras en terminal";
const concepto = { id: "concepto-1", descripcion, cantidad: 1.25, monto: 80, iva: 16, ieps: 8 };

describe("Conceptos fiscales de factura CxP en móvil", () => {
  it("muestra los mismos importes de línea y el resumen fiscal de escritorio", () => {
    viewport.mobile = true;
    consulta.mockReturnValue({ data: [concepto] });
    const section = <ConceptosFacturaSection facturaId="factura-1" moneda="MXN" iva={17} retenciones={1.25} total={123.75} />;
    const { rerender } = render(section);

    const lista = screen.getByRole("list", { name: "Conceptos de la factura" });
    const vistaMovil = within(lista);
    expect(vistaMovil.getByRole("heading", { name: `#1 ${descripcion}` })).toBeVisible();
    expect(vistaMovil.getByText("Cantidad 1.25")).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const importes = ["MXN 80.00", "MXN 100.00", "MXN 16.00", "MXN 8.00", "MXN 124.00"];
    for (const importe of importes) expect(vistaMovil.getByText(importe)).toBeVisible();
    expect(screen.getByText("IVA global sin desglose").parentElement).toHaveTextContent("MXN 1.00");
    expect(screen.getByText("Retenciones").parentElement).toHaveTextContent("−MXN 1.25");
    expect(screen.getByText("MXN 123.75")).toBeVisible();

    viewport.mobile = false;
    rerender(<ConceptosFacturaSection facturaId="factura-1" moneda="MXN" iva={17} retenciones={1.25} total={123.75} />);
    const vistaEscritorio = within(screen.getByRole("row", { name: new RegExp(descripcion) }));
    expect(vistaEscritorio.getByRole("cell", { name: "1.25" })).toBeVisible();
    for (const importe of importes) expect(vistaEscritorio.getByRole("cell", { name: importe })).toBeVisible();
    expect(screen.getByText("MXN 123.75")).toBeVisible();
  });

  it("preserva el texto de líneas sin descripción y muestra sólo los impuestos aplicables", () => {
    viewport.mobile = true;
    consulta.mockReturnValue({ data: [{ ...concepto, descripcion: "", ieps: 0 }] });
    render(<ConceptosFacturaSection facturaId="factura-1" moneda="MXN" />);
    expect(screen.getByRole("heading", { name: "#1 (Sin descripción)" })).toBeVisible();
    expect(screen.queryByText("IEPS")).not.toBeInTheDocument();
  });
});

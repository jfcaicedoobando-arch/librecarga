import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FacturaDetalle } from "@/features/facturacion/services/detail";
import { FacturaDocumentosSection } from "../FacturaDocumentosSection";

const descargar = vi.hoisted(() => vi.fn());
vi.mock("@/features/facturacion/hooks/useDescargarCfdi", () => ({ useDescargarCfdi: () => descargar }));

const factura = {
  id: "factura-1",
  numero: "F-1",
  uuid_fiscal: "uuid-1",
  factura_pdf_url: "facturas/F-1.pdf",
  factura_xml_url: null,
  acuse_cancelacion_xml: "<acuse/>",
} as FacturaDetalle;

describe("Documentos del CFDI", () => {
  it("distingue PDF, XML y acuse; cada archivo fiscal conserva su acción", () => {
    const crearEnlace = vi.fn(() => "blob:acuse");
    const eliminarEnlace = vi.fn();
    const abrirEnlace = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", { createObjectURL: crearEnlace, revokeObjectURL: eliminarEnlace });
    render(<FacturaDocumentosSection factura={factura} />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir XML" }));
    fireEvent.click(screen.getByRole("button", { name: "Descargar acuse" }));

    expect(descargar).toHaveBeenNthCalledWith(1, factura.factura_pdf_url, "pdf");
    expect(descargar).toHaveBeenNthCalledWith(2, null, "xml");
    expect(crearEnlace).toHaveBeenCalledWith(expect.objectContaining({ type: "application/xml" }));
    const enlace = abrirEnlace.mock.contexts[0] as HTMLAnchorElement;
    expect(enlace.download).toBe("Acuse_cancelacion_F-1.xml");
    expect(eliminarEnlace).toHaveBeenCalledWith("blob:acuse");
  });

  it("mantiene las acciones fiscales deshabilitadas antes de timbrar", () => {
    render(<FacturaDocumentosSection factura={{ ...factura, uuid_fiscal: null, acuse_cancelacion_xml: null }} />);

    expect(screen.getByRole("button", { name: "Abrir PDF" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Abrir XML" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Descargar acuse" })).not.toBeInTheDocument();
  });
});

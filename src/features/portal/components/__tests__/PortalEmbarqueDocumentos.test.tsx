import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PortalEmbarqueDocumentos } from "../PortalEmbarqueDocumentos";
import type { ComponentProps } from "react";

const mocks = vi.hoisted(() => ({ mobile: false, handleDownload: vi.fn() }));

vi.mock("@/hooks/shared", () => ({ useIsMobile: () => mocks.mobile }));
vi.mock("@/features/portal/hooks", () => ({
  usePortalDocumentDownload: () => ({ downloadingId: null, handleDownload: mocks.handleDownload }),
}));

const factura = {
  id: "factura", nombre: "Factura comercial", archivo: "documentos/factura.pdf", estado: "Validado",
  embarque_id: "embarque-demo", organization_id: "org-demo", created_at: "2026-11-01", updated_at: null,
} satisfies ComponentProps<typeof PortalEmbarqueDocumentos>["documentos"][number];

describe("PortalEmbarqueDocumentos", () => {
  it.each([false, true])("identifica el documento descargable por nombre (móvil: %s)", (mobile) => {
    mocks.mobile = mobile;
    mocks.handleDownload.mockClear();
    render(<PortalEmbarqueDocumentos documentos={[
      factura,
      { ...factura, id: "orden", nombre: "Orden de compra", archivo: null },
    ]} />);

    fireEvent.click(screen.getByRole("button", { name: "Descargar Factura comercial" }));
    expect(mocks.handleDownload).toHaveBeenCalledExactlyOnceWith(factura.archivo, factura.id);
    expect(screen.queryByRole("button", { name: "Descargar Orden de compra" })).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { makeCotizacionRow } from "@/test/fixtures/cotizacionFactory";
import { CotizacionDetalleHeader } from "../CotizacionDetalleHeader";

const motivo = "Agrega conceptos de venta con importe antes de exportar o enviar la cotización.";
const motivoPdf = "Agrega conceptos de venta con importe antes de exportar la cotización.";

describe("Envío por correo en el detalle de una cotización", () => {
  it("explica a la vista por qué está bloqueado hasta que haya un importe efectivo", () => {
    const onEnviarEmail = vi.fn();
    const vista = (conceptos_venta: ReturnType<typeof makeCotizacionRow>["conceptos_venta"]) => (
      <MemoryRouter>
        <CotizacionDetalleHeader cotizacion={makeCotizacionRow({ conceptos_venta })} nombreDestinatario="Cliente sintético"
          onBack={vi.fn()} onExportarPdf={vi.fn()} onEnviarEmail={onEnviarEmail} />
      </MemoryRouter>
    );
    const { rerender } = render(vista([]));
    const enviar = () => screen.getByRole("button", { name: "Enviar por correo" });
    expect(enviar()).toBeDisabled();
    expect(enviar()).toHaveAccessibleDescription(motivo);
    const exportar = () => screen.getByRole("button", { name: "Exportar PDF" });
    expect(exportar()).toBeDisabled();
    expect(exportar()).toHaveAccessibleDescription(motivo);
    expect(screen.getByText(motivo)).toBeVisible();

    rerender(vista([{ descripcion: "Flete", cantidad: 2, precio_unitario: 500, moneda: "USD", unidad_medida: "Contenedor", aplica_iva: false, total: 0 }]));
    expect(screen.queryByText(motivo)).toBeNull();
    expect(enviar()).toBeEnabled();
    expect(exportar()).toBeEnabled();
    fireEvent.click(enviar());
    expect(onEnviarEmail).toHaveBeenCalledOnce();
  });

  it("mantiene oculta la acción para prospectos y lectores sin capacidad de envío", () => {
    const vista = (es_prospecto: boolean, onEnviarEmail?: () => void) => (
      <MemoryRouter>
        <CotizacionDetalleHeader cotizacion={makeCotizacionRow({ es_prospecto, conceptos_venta: [] })} nombreDestinatario="Cliente sintético"
          onBack={vi.fn()} onExportarPdf={vi.fn()} onEnviarEmail={onEnviarEmail} />
      </MemoryRouter>
    );
    const { rerender } = render(vista(true, vi.fn()));
    expect(screen.queryByRole("button", { name: "Enviar por correo" })).toBeNull();
    expect(screen.queryByText(motivo)).toBeNull();
    rerender(vista(false));
    expect(screen.queryByRole("button", { name: "Enviar por correo" })).toBeNull();
    expect(screen.queryByText(motivo)).toBeNull();
    expect(screen.getByRole("button", { name: "Exportar PDF" })).toHaveAccessibleDescription(motivoPdf);
  });
});

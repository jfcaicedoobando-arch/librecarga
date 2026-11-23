/**
 * P1 · Auditoría IVA — el portal público no puede presentar un total con IVA
 * como definitivo cuando hay renglones legacy sin clasificar.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PortalProformaResumen } from "../PortalProformaResumen";
import type { PortalProformaConcepto, PortalProformaData } from "../../../services/portalPublico";
import { fiscalCotizacionFixture } from "@/test/fixtures/snapshotFiscalCotizacion";

const proforma = {
  numero: "PF-2", expediente: "EXP-2", cliente_nombre: "Cliente", moneda: "MXN",
  subtotal: 100, iva: 16, total: 116, subtotal_mxn: 100, iva_mxn: 16,
  total_mxn: 116, subtotal_usd: 0, iva_usd: 0, total_usd: 0,
} as PortalProformaData;

function concepto(extra: Partial<PortalProformaConcepto>): PortalProformaConcepto {
  return {
    id: "1", descripcion: "Servicio", cantidad: 1, precio_unitario: 100,
    importe: 100, moneda: "MXN", ...extra,
  } as PortalProformaConcepto;
}

describe("PortalProformaResumen · IVA por confirmar", () => {
  it("avisa y rotula el total como estimado con renglón legacy gravado en silencio", () => {
    render(
      <PortalProformaResumen
        proforma={proforma}
        conceptos={[concepto({ aplica_iva: true, tipo_iva: null })]}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/tratamiento de IVA está por confirmar/i);
    expect(screen.getByText("Total estimado")).toBeInTheDocument();
  });

  it("con todo clasificado el total se presenta como definitivo", () => {
    render(
      <PortalProformaResumen
        proforma={proforma}
        conceptos={[concepto({ aplica_iva: true, tipo_iva: "gravado_16" })]}
      />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("usa el neto fiscal en moneda original aunque la cabecera incluya el equivalente MXN", () => {
    const fiscal = fiscalCotizacionFixture().bloques.map((bloque) => ({ ...bloque, moneda: "USD" as const }));
    render(<PortalProformaResumen proforma={{ ...proforma, moneda: "USD", total_mxn: 4608.40, totales_fiscales: fiscal }}
      conceptos={[concepto({ moneda: "USD", aplica_iva: true, tipo_iva: "gravado_16" })]} />);
    expect(screen.getByText("ISR retenido")).toBeInTheDocument();
    expect(screen.getByText(/230\.42/)).toBeInTheDocument();
    expect(screen.getByText("Total neto")).toBeInTheDocument();
    expect(screen.queryByText(/4,608\.40/)).not.toBeInTheDocument();
  });
});

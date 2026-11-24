import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { compararMoneda } from "@/features/crm/services/pricing/costoVsRealPricing";
import { TablaCostoReal } from "../fase6/CostoVsRealPricing";

vi.mock("@/features/crm/hooks/useRecotizarPricing", () => ({ useCostoVsReal: vi.fn() }));

describe("TablaCostoReal", () => {
  it("muestra los importes por moneda y conserva el porcentaje vacío donde no hay base de comparación", () => {
    render(<TablaCostoReal resumen={{
      estado: "con_resultado",
      cotizacionFolio: null,
      expediente: null,
      monedas: [compararMoneda("USD", 100, 125), compararMoneda("MXN", 0, 500)],
    }} />);

    const tabla = within(screen.getByRole("table"));
    const usd = within(tabla.getByRole("row", { name: /USD 100/ }));
    const mxn = within(tabla.getByRole("row", { name: /MXN 0/ }));

    expect(usd.getByRole("cell", { name: "USD 125.00" })).toBeInTheDocument();
    expect(usd.getByRole("cell", { name: "25.0 %" })).toBeInTheDocument();
    expect(mxn.getAllByRole("cell", { name: "MXN 500.00" })).toHaveLength(2);
    expect(mxn.getByRole("cell", { name: "—" })).toBeInTheDocument();
  });
});

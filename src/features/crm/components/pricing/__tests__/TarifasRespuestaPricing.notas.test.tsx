import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("@/features/costeo", () => ({ TarifaForm: () => null }));
import { TarifasRespuestaPricing } from "../TarifasRespuestaPricing";
import type { TarifaRespuestaRow } from "@/features/crm/services/pricing/tarifasRespuesta";

const base: TarifaRespuestaRow = {
  id: "t1", flete_base: 1800, moneda: "USD", unidad_flete: null, carta_garantia: null,
  transit_time_dias: null, vigente_hasta: null, notas: null, agente: null, naviera: null, tipo: null, ruta: null,
};
const props = { solicitudId: "s1", editable: false, hayOpcionesViejas: false, isLoading: false, isError: false, onSaved: () => {} };

describe("Notas de la respuesta de Pricing", () => {
  it("el solicitante ve las notas que Pricing guardó en la tarifa", () => {
    render(<TarifasRespuestaPricing {...props} tarifas={[{ ...base, notas: "Sujeto a espacio en buque" }]} />);
    expect(screen.getByText("Sujeto a espacio en buque")).toBeInTheDocument();
  });
  it("sin notas no muestra el apartado", () => {
    render(<TarifasRespuestaPricing {...props} tarifas={[base]} />);
    expect(screen.queryByText(/Notas:/)).toBeNull();
  });
});

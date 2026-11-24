import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeCotizacionRow } from "@/test/fixtures/cotizacionFactory";
import { buildDatosGenerales } from "@/generators/cotizacion/datosGenerales";
import SeccionMercanciaCotizacionDetalle from "../../SeccionMercanciaCotizacionDetalle";

vi.mock("@/features/catalogos/hooks", () => ({ useTiposContenedor: () => ({ data: [] }) }));

describe("mercancía de una cotización aérea guardada", () => {
  it("muestra medidas e indicadores presentes aun sin líneas de dimensiones", () => {
    const cotizacion = makeCotizacionRow({
      modo: "Aéreo", peso_fisico_kg: 70, peso_kg: 100, volumen_m3: 1, dimensiones_aereas: [],
      baterias_litio: false, known_shipper: true, tipo_aeronave: "CAO",
    });
    render(<SeccionMercanciaCotizacionDetalle cotizacion={cotizacion} />);
    expect(screen.getByText("Peso físico").nextElementSibling).toHaveTextContent("70 kg");
    expect(screen.getByText("Peso volumétrico").nextElementSibling).toHaveTextContent("100 kg");
    expect(screen.getByText("Peso tasable").nextElementSibling).toHaveTextContent("167 kg");
    expect(screen.getByText("Volumen total").nextElementSibling).toHaveTextContent("1 m³");
    expect(screen.getByText("Baterías de litio").nextElementSibling).toHaveTextContent("No");
    expect(screen.getByText("Tipo de avión").nextElementSibling).toHaveTextContent("CAO");
  });

  it("conserva escalas en Datos Generales y omite sólo la ruta aérea redundante", () => {
    const cotizacion = makeCotizacionRow({ modo: "Aéreo", origen: "MEX", destino: "LAX", ruta_texto: " MEX→ LAX " });
    expect(buildDatosGenerales(cotizacion).some(([nombre]) => nombre === "Ruta")).toBe(false);
    expect(buildDatosGenerales({ ...cotizacion, ruta_texto: "MEX → DFW → LAX" })).toContainEqual(["Ruta", "MEX → DFW → LAX"]);
    expect(buildDatosGenerales({ ...cotizacion, modo: "Marítimo" })).toContainEqual(["Ruta", " MEX→ LAX "]);
  });
});

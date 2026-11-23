import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CotizacionDocument } from "../CotizacionDocument";
import { makeCotizacionRow } from "@/test/fixtures/cotizacionFactory";

describe("CotizacionDocument — banderas aéreas", () => {
  it("muestra litio, Known Shipper y CAO en una cotización aérea", () => {
    const c = makeCotizacionRow({ modo: "Aéreo", baterias_litio: true, known_shipper: true, tipo_aeronave: "CAO" });
    const text = render(<CotizacionDocument cotizacion={c} />).container.textContent ?? "";
    expect(text).toContain("Condiciones de transporte aéreo");
    expect(text).toContain("Baterías de litio");
    expect(text).toContain("CAO (sólo carguero)");
  });
  it("no las muestra fuera de aéreo", () => {
    const c = makeCotizacionRow({ modo: "Marítimo", baterias_litio: true, known_shipper: true, tipo_aeronave: "CAO" });
    expect(render(<CotizacionDocument cotizacion={c} />).container.textContent).not.toContain("Condiciones de transporte aéreo");
  });
});

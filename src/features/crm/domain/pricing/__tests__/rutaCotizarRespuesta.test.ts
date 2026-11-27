import { describe, expect, it } from "vitest";
import { rutaCotizarRespuesta } from "../rutaCotizarRespuesta";

describe("rutaCotizarRespuesta", () => {
  it.each(["Aéreo", "Terrestre"])("%s usa el prefill multimodo", (servicio) => {
    expect(rutaCotizarRespuesta("t1", { id: "s1", servicio, oportunidad_id: "o1" }))
      .toBe("/cotizaciones/nueva?tarifaAerea=t1&solicitud=s1&oportunidad=o1");
  });
  it("marítimo conserva el contexto de tarifa", () => {
    expect(rutaCotizarRespuesta("t1", { id: "s1", servicio: "Marítimo", oportunidad_id: null }))
      .toBe("/cotizaciones/nueva?tarifa=t1&solicitud=s1");
  });
});

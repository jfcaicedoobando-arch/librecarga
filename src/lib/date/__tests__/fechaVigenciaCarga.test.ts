import { describe, expect, it } from "vitest";
import { fechaVigenciaCarga, tarifaCubreCarga } from "../fechaVigenciaCarga";

describe("vigencia de tarifa en el día previsto de carga", () => {
  it("elige el día futuro de carga, no el día de consulta", () => {
    expect(fechaVigenciaCarga("2026-12-10", "2026-11-23")).toBe("2026-12-10");
  });
  it.each([null, "2026-11-22", "2026-11-23", "2026-02-30", "sin fecha"])(
    "respalda a hoy si no hay fecha futura válida (%s)", (fecha) => {
      expect(fechaVigenciaCarga(fecha, "2026-11-23")).toBe("2026-11-23");
    },
  );
  it("no ofrece una tarifa que vence antes de la carga aunque siga vigente hoy", () => {
    expect(tarifaCubreCarga({ vigente_desde: "2026-11-01", vigente_hasta: "2026-12-09" }, "2026-12-10")).toBe(false);
  });
  it("no ofrece una tarifa que inicia después de la carga", () => {
    expect(tarifaCubreCarga({ vigente_desde: "2026-12-11", vigente_hasta: "2026-12-31" }, "2026-12-10")).toBe(false);
  });
  it.each(["2026-12-10", "2026-12-31"])("incluye los límites de la vigencia (%s)", (fecha) => {
    expect(tarifaCubreCarga({ vigente_desde: "2026-12-10", vigente_hasta: "2026-12-31" }, fecha)).toBe(true);
  });
});
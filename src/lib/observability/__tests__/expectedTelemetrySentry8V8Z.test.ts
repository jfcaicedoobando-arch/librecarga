import { describe, it, expect } from "vitest";
import { isExpectedTelemetryError } from "../expectedTelemetryError";

describe("Sentry 8V/8Z: validaciones esperadas de cotización", () => {
  it("margen bajo el mínimo es validación, no bug", () => {
    expect(isExpectedTelemetryError(new Error("LC_COT_MARGEN_BAJO_MINIMO: margen 3.62, mínimo 9"))).toBe(true);
  });
  it("correo fuera de los contactos del cliente es validación", () => {
    expect(isExpectedTelemetryError(new Error("Servicio de correo (400): Uno o más correos no pertenecen a los contactos del cliente"))).toBe(true);
  });
  it("otros fallos del servicio de correo siguen reportándose", () => {
    expect(isExpectedTelemetryError(new Error("Servicio de correo (500): error interno"))).toBe(false);
  });
});

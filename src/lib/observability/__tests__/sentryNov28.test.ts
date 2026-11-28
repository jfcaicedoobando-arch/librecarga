import { describe, expect, it } from "vitest";
import { classifyError } from "../classifyError";
import { isExpectedTelemetryError } from "../expectedTelemetryError";

describe("Sentry 28/11", () => {
  it("clasifica como red el fetch envuelto (REACT-91)", () => {
    const e = new Error("TypeError: Failed to fetch (eorqadkulqtneqjbsblk.supabase.co)");
    expect(classifyError(e).kind).toBe("network");
  });
  it("clasifica como red el envío fallido a la función (REACT-9E)", () => {
    const e = Object.assign(new Error("Failed to send a request to the Edge Function"), { name: "FacturapiError" });
    expect(classifyError(e).kind).toBe("network");
  });
  it("no confunde un error genérico con red", () => {
    expect(classifyError(new Error("Algo falló")).kind).toBe("unknown");
  });
  it("trata como aviso esperado el uso CFDI incompatible (REACT-9A)", () => {
    const msg = "Configura un uso CFDI compatible con el régimen del receptor en la ficha del cliente antes de convertir la proforma.";
    expect(isExpectedTelemetryError(new Error(msg))).toBe(true);
  });
});

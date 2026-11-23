import { describe, expect, it } from "vitest";
import { fechaVigenciaSolicitud } from "../fechaVigenciaSolicitud";

describe("fechaVigenciaSolicitud", () => {
  it("usa la fecha tentativa de carga futura", () => {
    expect(fechaVigenciaSolicitud("2026-12-15", "2026-11-23")).toBe("2026-12-15");
  });
  it("usa hoy si la fecha de carga ya pasó", () => {
    expect(fechaVigenciaSolicitud("2026-11-01", "2026-11-23")).toBe("2026-11-23");
  });
  it("usa hoy si no hay fecha de carga", () => {
    expect(fechaVigenciaSolicitud(null, "2026-11-23")).toBe("2026-11-23");
  });
});

/**
 * N4 (v13.823.386) — el movimiento manual usa una llave estable: un reintento
 * (doble click / red lenta) no crea un segundo movimiento ni duplica dinero.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mock = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("@/services/__tests__/_supabaseChainMock");
  return createSupabaseMock();
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: mock.supabase }));
vi.mock("@/services/bitacora/registrar", () => ({ registrarActividad: vi.fn() }));

import { registrarMovimientoManual } from "../conciliacionManual";
import { registrarActividad } from "@/services/bitacora/registrar";

const payload = {
  cuentaBancariaId: "c1",
  fecha: "2026-09-10",
  concepto: "Comisión bancaria",
  cargo: 100,
  abono: 0,
  userId: "u1",
  claveIdempotencia: "clave-fija",
};

describe("registrarMovimientoManual · idempotencia (N4)", () => {
  beforeEach(() => {
    mock.resetResults();
    mock.tableCalls.length = 0;
    vi.mocked(registrarActividad).mockClear();
  });

  it("usa la llave estable recibida como hash de deduplicación", async () => {
    mock.setTableResult("bbva_movimientos", { data: [{ id: "m1" }], error: null });
    await expect(registrarMovimientoManual(payload)).resolves.toBe("registrado");
    expect(mock.getMutationPayload("bbva_movimientos")).toMatchObject({
      hash_dedupe: "manual-clave-fija",
    });
  });

  it("recupera el movimiento original al reintentar con otra referencia", async () => {
    // MNY: dos consultas a la misma tabla — primero el INSERT en conflicto y
    // luego el SELECT `.maybeSingle()`, que devuelve UN objeto (no un arreglo).
    mock.setTableResultOnce("bbva_movimientos", {
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    mock.setTableResultOnce("bbva_movimientos", {
      data: { id: "m1", fecha: payload.fecha, concepto: payload.concepto, referencia: "Original", cargo: 100, abono: 0 },
      error: null,
    });
    await expect(registrarMovimientoManual({ ...payload, referencia: "Editada" })).resolves.toBe("recuperado");
    expect(registrarActividad).not.toHaveBeenCalled();
  });

  it("MNY: avisa conflicto si la llave ya se usó con otro contenido", async () => {
    mock.setTableResultOnce("bbva_movimientos", {
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    mock.setTableResultOnce("bbva_movimientos", {
      data: { id: "m1", fecha: "2026-09-01", concepto: "Otro concepto", cargo: 250, abono: 0 },
      error: null,
    });
    await expect(registrarMovimientoManual(payload)).rejects.toThrow(/datos distintos/i);
  });

  it("propaga cualquier otro error de la base", async () => {
    mock.setTableResult("bbva_movimientos", {
      data: null,
      error: { code: "22023", message: "LC_MOVIMIENTO_MANUAL_FECHA_FUTURA" },
    });
    await expect(registrarMovimientoManual(payload)).rejects.toMatchObject({ code: "22023" });
  });
});

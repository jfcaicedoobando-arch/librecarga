import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPrefillTarifaAerea } from "../prefillTarifaAerea";

const m = vi.hoisted(() => ({ fecha: "2026-12-10" as string | null, desde: "2026-12-01", hasta: "2026-12-31", modo: "Aéreo" }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const row = table === "costeo_tarifas"
    ? { id: "tarifa", modo: m.modo, moneda: "USD", estado: "vigente", estado_aprobacion: "vigente",
        vigente_desde: m.desde, vigente_hasta: m.hasta, aeropuerto_origen: "PVG", aeropuerto_destino: "MEX" }
    : { id: "solicitud", servicio: m.modo, fecha_tentativa_carga: m.fecha, peso: "20", unidad_medida: "kg" };
  return { select() { return this; }, eq() { return this; }, is() { return this; },
    maybeSingle: () => Promise.resolve({ data: row, error: null }) };
} } }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-24T03:57:00Z"));
  m.fecha = "2026-12-10"; m.desde = "2026-12-01"; m.hasta = "2026-12-31"; m.modo = "Aéreo";
});
afterEach(() => vi.useRealTimers());

describe("relectura de la vigencia al abrir una cotización desde Pricing", () => {
  it.each(["Aéreo", "Terrestre"])("acepta una tarifa futura de %s que cubre el día de carga", async (modo) => {
    m.modo = modo;
    await expect(fetchPrefillTarifaAerea("org", "tarifa", "solicitud")).resolves.toMatchObject({ tarifaId: "tarifa", modo });
  });
  it("rechaza la tarifa si la carga se movió después de su vencimiento", async () => {
    m.desde = "2026-11-01"; m.hasta = "2026-12-09";
    await expect(fetchPrefillTarifaAerea("org", "tarifa", "solicitud")).rejects.toThrow("fecha tentativa de carga");
  });
  it("rechaza la tarifa que todavía no inicia al cargar", async () => {
    m.desde = "2026-12-11";
    await expect(fetchPrefillTarifaAerea("org", "tarifa", "solicitud")).rejects.toThrow("fecha tentativa de carga");
  });
  it.each([null, "2026-11-22"])("sin fecha futura (%s) exige vigencia al día de México", async (fecha) => {
    m.fecha = fecha; m.desde = "2026-11-01"; m.hasta = "2026-11-23";
    await expect(fetchPrefillTarifaAerea("org", "tarifa", "solicitud")).resolves.toMatchObject({ tarifaId: "tarifa" });
    m.hasta = "2026-11-22";
    await expect(fetchPrefillTarifaAerea("org", "tarifa", "solicitud")).rejects.toThrow("fecha tentativa de carga");
  });
});
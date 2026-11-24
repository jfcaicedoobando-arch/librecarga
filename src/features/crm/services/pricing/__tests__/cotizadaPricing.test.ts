import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SolicitudPricingRow } from "../tiposPricing";
const mock = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import("@/services/__tests__/_supabaseChainMock");
  return createSupabaseMock();
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: mock.supabase }));
import { conectarCotizadas } from "../cotizadaPricing";
import { datosCopiaSolicitud } from "../copiaSolicitud";
const solicitud = { id: "sol-1", organization_id: "org-1", estado: "respondida" } as SolicitudPricingRow;
beforeEach(() => { mock.resetResults(); mock.tableCalls.length = 0; });
describe("cierre de Pricing por cotización vinculada", () => {
  it("marca Cotizada sólo la solicitud que tiene vínculo exacto", async () => {
    mock.setTableResult("cotizaciones", { data: [{ id: "cot-1", folio: "COT-1", pricing_solicitud_id: "sol-1" }], error: null });
    const filas = await conectarCotizadas([solicitud, { ...solicitud, id: "sol-2" }]);
    expect(filas[0]).toMatchObject({ estado: "cotizada", cotizacion_finalizada: { id: "cot-1", folio: "COT-1" } });
    expect(filas[1].estado).toBe("respondida");
    expect(solicitud.estado).toBe("respondida");
    const call = mock.tableCalls[0];
    expect(call.opArgs).toContainEqual(["organization_id", "org-1"]);
    expect(call.opArgs).toContainEqual(["deleted_at", null]);
    expect(call.opArgs).toContainEqual(["estado", "Archivada"]);
    expect(call.opArgs).toContainEqual([0, 99]);
  });
  it("sin cotización conserva Respondida y permite seguir el flujo", async () => {
    mock.setTableResult("cotizaciones", { data: [], error: null });
    expect(await conectarCotizadas([solicitud])).toEqual([solicitud]);
  });
  it("no reabre una solicitud cancelada", async () => {
    mock.setTableResult("cotizaciones", { data: [{ id: "cot-1", folio: "COT-1", pricing_solicitud_id: "sol-1" }], error: null });
    expect((await conectarCotizadas([{ ...solicitud, estado: "cancelada" }]))[0].estado).toBe("cancelada");
  });
  it("no copia el cierre de la solicitud anterior", () => {
    const datos = datosCopiaSolicitud({ ...solicitud, estado: "cotizada", cotizacion_finalizada: { id: "cot-1", folio: "COT-1" } });
    expect(datos).not.toHaveProperty("cotizacion_finalizada");
    expect(datos).not.toHaveProperty("estado");
  });
  it("un error de lectura no habilita cotizar por confundirlo con ausencia de cotización", async () => {
    const error = new Error("Sin acceso");
    mock.setTableResult("cotizaciones", { data: null, error });
    await expect(conectarCotizadas([solicitud])).rejects.toBe(error);
  });
});
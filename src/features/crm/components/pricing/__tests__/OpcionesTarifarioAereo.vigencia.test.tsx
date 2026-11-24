import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SolicitudPricingRow } from "@/features/crm/services/pricing/tiposPricing";
import { crm } from "@/features/crm/queryKeys";
import { OpcionesTarifarioAereo } from "../OpcionesTarifarioAereo";

const m = vi.hoisted(() => ({ from: vi.fn(), lte: vi.fn(), gte: vi.fn(), eq: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: m.from } }));
vi.mock("react-router", async (original) => ({
  ...(await original<typeof import("react-router")>()), useNavigate: () => vi.fn(),
}));

const solicitud: SolicitudPricingRow = {
  id: "sol", organization_id: "org", oportunidad_id: "op", solicitante_id: "solicitante", created_by: "creador",
  estado: "enviada", folio: "SOL-1", fecha: "2026-11-23", complejidad: "media", created_at: "", updated_at: "",
  cantidad: 1, cliente: null, commodity: null, container_size: null, deleted_at: null, delivery: null,
  destino: null, dimensiones: null, enviada_at: null, estibable: null, fecha_tentativa_carga: "2026-12-10",
  imo: null, incoterm: null, notas: null, origen: null, peso: "20", pod: "MEX — Ciudad de México", pol: "PVG — Shanghai",
  respondida_at: null, submodalidad: null, volumen_cbm: null, imo_clase: null, imo_un: null, modalidad_negocio: null,
  baterias_litio: null, known_shipper: null, tipo_aeronave: null, origen_cp: null, destino_cp: null, paradas: null,
  cruce_fronterizo: null, in_bond: null, tipo_unidad: null, tarimas: null, arrastre_puerto: null, retorno_vacio: null,
  sobrepeso: null, asignada_a: null, pausada_at: null, info_motivo: null, motivo_sin_opcion: null, aviso_80_at: null,
  aviso_vencida_at: null, servicio: "Aéreo", tipo_carga: null, unidad_medida: null, tipo_operacion: null,
  sector_economico: null, tipo_solicitud: null, complejidad_motivo: null, plazo_motivo: null, vence_at: null,
  tarifa_tarifario_id: null,
};

let client: QueryClient;
function vista(fecha: string | null, pol: string | null = solicitud.pol) {
  return <QueryClientProvider client={client}>
    <OpcionesTarifarioAereo solicitud={{ ...solicitud, fecha_tentativa_carga: fecha, pol }} puedeCotizar={false} />
  </QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  // A las 03:57 UTC del 24 sigue siendo 23 de noviembre en México.
  vi.setSystemTime(new Date("2026-11-24T03:57:00Z"));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const query = {
    select: vi.fn().mockReturnThis(), eq: m.eq.mockReturnThis(), lte: m.lte.mockReturnThis(),
    gte: m.gte.mockReturnThis(), order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  m.from.mockReturnValue(query);
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });

describe("vigencia aérea desde la fecha tentativa de la solicitud", () => {
  it("consulta ambos límites contra el día de carga, no contra hoy, manteniendo ruta y organización", async () => {
    render(vista("2026-12-10"));
    await waitFor(() => expect(m.gte).toHaveBeenCalledWith("vigente_hasta", "2026-12-10"));
    expect(m.lte).toHaveBeenCalledWith("vigente_desde", "2026-12-10");
    expect(m.gte).not.toHaveBeenCalledWith("vigente_hasta", "2026-11-23");
    expect(m.eq).toHaveBeenCalledWith("organization_id", "org");
    expect(m.eq).toHaveBeenCalledWith("aeropuerto_origen", "PVG");
    expect(m.eq).toHaveBeenCalledWith("aeropuerto_destino", "MEX");
    expect(m.eq).toHaveBeenCalledWith("estado_aprobacion", "vigente");
  });

  it("cambia la consulta y separa la caché cuando cambia la fecha de carga", async () => {
    const { rerender } = render(vista("2026-12-10"));
    const primera = crm.tarifasAereasSugeridas("org", "PVG", "MEX", "2026-12-10");
    await waitFor(() => expect(client.getQueryData(primera)).toEqual([]));
    rerender(vista("2026-12-20"));
    const segunda = crm.tarifasAereasSugeridas("org", "PVG", "MEX", "2026-12-20");
    await waitFor(() => expect(client.getQueryData(segunda)).toEqual([]));
    expect(m.gte).toHaveBeenLastCalledWith("vigente_hasta", "2026-12-20");
    expect(m.lte).toHaveBeenLastCalledWith("vigente_desde", "2026-12-20");
    expect(m.from).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(primera)).toEqual([]);
  });

  it.each([null, "2026-11-22", "2026-11-23", "sin fecha"])(
    "conserva el respaldo al día de México si la fecha es %s", async (fecha) => {
      render(vista(fecha));
      await waitFor(() => expect(m.gte).toHaveBeenCalledWith("vigente_hasta", "2026-11-23"));
      expect(m.lte).toHaveBeenCalledWith("vigente_desde", "2026-11-23");
    },
  );

  it("no consulta sin aeropuerto de origen", () => {
    render(vista("2026-12-10", null));
    expect(m.from).not.toHaveBeenCalled();
  });
});
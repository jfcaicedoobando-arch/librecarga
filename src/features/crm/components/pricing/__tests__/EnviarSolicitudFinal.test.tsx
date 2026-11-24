import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SolicitudPricingRow } from "@/features/crm/services/pricing/tiposPricing";

const services = vi.hoisted(() => ({ enviarSolicitud: vi.fn(), actualizarSolicitud: vi.fn() }));
const tarifario = vi.hoisted(() => ({ isError: false, reintentar: vi.fn() }));
vi.mock("@/features/crm/hooks/useOpcionesTarifario", () => ({ useOpcionesTarifario: () => ({ opciones: [], isLoading: false, ...tarifario }) }));
vi.mock("@/features/crm/services/pricing/pricingCrm", () => services);
vi.mock("@/features/crm/services/pricing/tarifasParaPricing", () => ({ listarTarifasParaPricing: vi.fn() }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess: vi.fn(), notifyError: vi.fn() }));
import { EnviarSolicitudFinal } from "../EnviarSolicitudFinal";
import { setAuthSnapshot } from "@/lib/auth/authSnapshot";
import { purgeSessionCache } from "@/lib/auth/purgeSessionCache";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { crm } from "@/features/crm/queryKeys";

const solicitud: SolicitudPricingRow = {
  id: "s1", organization_id: "org1", oportunidad_id: "o1", solicitante_id: "u1", created_by: "u1",
  estado: "borrador", version: 1, recotizada_at: null, folio: "SP1", fecha: "2026-10-08", complejidad: "media", created_at: "", updated_at: "",
  cantidad: 1, cliente: "ACME", commodity: "Llantas", container_size: null, deleted_at: null, delivery: null,
  destino: "Manzanillo", dimensiones: "1x1x1", enviada_at: null, estibable: true, fecha_tentativa_carga: null,
  imo: false, incoterm: "FOB", notas: null, origen: "Shanghai", peso: "1000", pod: "MXZLO", pol: "CNSHA",
  respondida_at: null, servicio: "Marítimo", submodalidad: "FCL", volumen_cbm: null, imo_clase: null, imo_un: null, modalidad_negocio: null, baterias_litio: null, known_shipper: null, tipo_aeronave: null, origen_cp: null, destino_cp: null, paradas: null, cruce_fronterizo: null, in_bond: null, tipo_unidad: null, tarimas: null, arrastre_puerto: null, retorno_vacio: null, sobrepeso: null, asignada_a: null, pausada_at: null, info_motivo: null, motivo_sin_opcion: null, aviso_80_at: null, aviso_vencida_at: null, tipo_carga: "40' HC", unidad_medida: "kg", tipo_operacion: "Importación", sector_economico: "General", tipo_solicitud: null, complejidad_motivo: null, plazo_motivo: null, vence_at: null, tarifa_tarifario_id: null,
};
const auth = { userId: "u1", email: null, organizationId: "org1", organizationName: null, role: "operador", effectiveRole: "operador" };
function diferido() {
  let resolve!: () => void; let reject!: (error: Error) => void;
  const promise = new Promise<void>((si, no) => { resolve = si; reject = no; });
  return { promise, resolve, reject };
}
let client: QueryClient;
function Vista({ fila = solicitud, puede = true }: { fila?: SolicitudPricingRow; puede?: boolean }) {
  return <QueryClientProvider client={client}><EnviarSolicitudFinal solicitud={fila} puede={puede} /></QueryClientProvider>;
}
beforeEach(() => {
  setAuthSnapshot(auth);
  tarifario.isError = false;
  tarifario.reintentar.mockClear();
  services.enviarSolicitud.mockReset().mockResolvedValue(undefined);
  services.actualizarSolicitud.mockReset().mockResolvedValue(undefined);
  vi.mocked(notifySuccess).mockClear(); vi.mocked(notifyError).mockClear();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No se permite red real"); }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => { cleanup(); client.clear(); });

describe("envío final después de revisar tarifario", () => {
  it.each([{ nombres: [] as string[] }, { nombres: ["factura.pdf"] }])("no permite enviar IMO Sí sin MSDS identificada ($nombres)", ({ nombres }) => {
    const key = crm.adjuntos(solicitud.id);
    client.setQueryDefaults(key, { staleTime: Infinity });
    client.setQueryData(key, nombres.map((nombre) => ({ nombre, path: nombre, tamano: 100, esImagen: false, creado: null })));
    render(<Vista fila={{ ...solicitud, imo: true, imo_clase: "3", imo_un: "1203" }} />);
    const boton = screen.getByRole("button", { name: "Enviar a Pricing" });
    expect(boton).toBeDisabled();
    fireEvent.click(boton);
    expect(services.enviarSolicitud).not.toHaveBeenCalled();
  });

  it("permite enviar IMO Sí con MSDS adjunta y los demás obligatorios completos", async () => {
    const key = crm.adjuntos(solicitud.id);
    client.setQueryDefaults(key, { staleTime: Infinity });
    client.setQueryData(key, [{ nombre: "MSDS-hoja.pdf", path: "org1/s1/1795489200000-MSDS-hoja.pdf", tamano: 100, esImagen: false, creado: null }]);
    render(<Vista fila={{ ...solicitud, imo: true, imo_clase: "3", imo_un: "1203" }} />);
    const boton = screen.getByRole("button", { name: "Enviar a Pricing" });
    expect(boton).toBeEnabled();
    fireEvent.click(boton);
    await waitFor(() => expect(services.enviarSolicitud).toHaveBeenCalledWith("s1"));
  });
  it("permite reintentar sin enviar ni declarar una ruta nueva si falla el tarifario", () => {
    tarifario.isError = true;
    const view = render(<Vista />);
    const boton = screen.getByRole("button", { name: "Enviar a Pricing" });
    expect(boton).toBeDisabled();
    expect(screen.queryByText(/Pricing buscará una ruta nueva/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(tarifario.reintentar).toHaveBeenCalledOnce();
    expect(services.actualizarSolicitud).not.toHaveBeenCalled();
    tarifario.isError = false;
    view.rerender(<Vista />);
    expect(boton).toBeEnabled();
    expect(screen.getByText(/Pricing buscará una ruta nueva/)).toBeInTheDocument();
  });

  it("dos clics en el mismo turno producen un solo envío y permiten reintentar tras fallo", async () => {
    const envio = diferido();
    services.enviarSolicitud.mockReturnValueOnce(envio.promise);
    render(<Vista />);
    const boton = screen.getByRole("button", { name: "Enviar a Pricing" });
    act(() => { boton.click(); boton.click(); });
    await waitFor(() => expect(services.enviarSolicitud).toHaveBeenCalledTimes(1));
    await act(async () => envio.reject(new Error("sin conexión")));
    await waitFor(() => expect(boton).toBeEnabled());
    fireEvent.click(boton);
    await waitFor(() => expect(services.enviarSolicitud).toHaveBeenCalledTimes(2));
    expect(services.enviarSolicitud.mock.calls).toEqual([["s1"], ["s1"]]);
  });

  it.each([false, true])("el resultado de otra solicitud no modifica la vista nueva (fallo=%s)", async (falla) => {
    const anterior = diferido(); const actual = diferido();
    services.enviarSolicitud.mockReturnValueOnce(anterior.promise).mockReturnValueOnce(actual.promise);
    const invalidar = vi.spyOn(client, "invalidateQueries");
    const view = render(<Vista />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar a Pricing" }));
    await waitFor(() => expect(services.enviarSolicitud).toHaveBeenCalledTimes(1));
    view.rerender(<Vista fila={{ ...solicitud, id: "s2" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar a Pricing" }));
    await waitFor(() => expect(services.enviarSolicitud).toHaveBeenCalledTimes(2));
    await act(async () => { if (falla) anterior.reject(new Error("anterior")); else anterior.resolve(); });
    expect(screen.getByRole("button", { name: "Enviar a Pricing" })).toBeDisabled();
    expect(invalidar).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled(); expect(notifyError).not.toHaveBeenCalled();
    await act(async () => actual.resolve());
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledTimes(1));
  });

  it.each(["usuario", "purga"])("revoca el envío pendiente al cambiar %s y libera la nueva vista", async (cambio) => {
    const envio = diferido();
    services.enviarSolicitud.mockReturnValueOnce(envio.promise);
    const invalidar = vi.spyOn(client, "invalidateQueries");
    render(<Vista />);
    fireEvent.click(screen.getByRole("button", { name: "Enviar a Pricing" }));
    await waitFor(() => expect(services.enviarSolicitud).toHaveBeenCalledTimes(1));
    await act(async () => { if (cambio === "usuario") setAuthSnapshot({ ...auth, userId: "u2" }); else purgeSessionCache(client); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Enviar a Pricing" })).toBeEnabled());
    await act(async () => envio.resolve());
    expect(invalidar).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled(); expect(notifyError).not.toHaveBeenCalled();
  });

  it.each(["enviada", "respondida", "cancelada"])("no ofrece enviar una solicitud %s", (estado) => {
    render(<Vista fila={{ ...solicitud, estado }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
  it("respeta la capacidad existente de envío", () => {
    render(<Vista puede={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

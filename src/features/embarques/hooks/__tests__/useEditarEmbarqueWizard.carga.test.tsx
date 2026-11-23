import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditarEmbarqueWizard } from "../useEditarEmbarqueWizard";

type Consulta = { data: unknown; isError: boolean; refetch: ReturnType<typeof vi.fn> };
const m = vi.hoisted(() => ({
  consultas: {} as Record<string, Consulta>,
  guardar: vi.fn().mockResolvedValue(undefined), navegar: vi.fn(), error: vi.fn(),
  prepararRevision: vi.fn(),
}));
const venta = { id: "v1", descripcion: "Flete", cantidad: 1, precio_unitario: 1000, total: 1000, moneda: "MXN", contenedor_id: null };
const costo = { id: "c1", concepto: "Costo", monto: 400, moneda: "MXN", proveedor_id: "p1", contenedor_id: null };

vi.mock("../useNavegacionEdicionEmbarque", () => ({ useVolverAlDetalleEmbarque: () => m.navegar }));
vi.mock("@/lib/contexts/AuthContext", () => ({ useAuth: () => ({ user: { email: "qa@example.invalid" }, effectiveRole: "admin" }) }));
vi.mock("../useEmbarques", () => ({
  useEmbarque: () => m.consultas.embarque,
  useEmbarqueConceptosVenta: () => m.consultas.ventas,
  useEmbarqueConceptosCosto: () => m.consultas.costos,
  useProveedoresForSelect: () => m.consultas.proveedores,
  useUpdateEmbarque: () => ({ mutateAsync: m.guardar, isPending: false }),
}));
vi.mock("../useContenedoresEmbarque", () => ({ useContenedoresEmbarque: () => m.consultas.contenedores }));
vi.mock("@/features/cliente/hooks/useClientes", () => ({
  useClientesForSelect: () => m.consultas.clientes, useContactosCliente: () => ({ data: [] }),
}));
vi.mock("@/hooks/shared", () => ({ useRegistrarActividad: () => ({ mutate: vi.fn() }) }));
vi.mock("@/features/cotizacion/hooks", async () => {
  const { useConceptosForm } = await import("@/features/cotizacion/hooks/wizard/useConceptosForm");
  return { useConceptosForm, useCotizacion: () => ({ data: null }), useCotizacionesAceptadas: () => ({ data: [] }) };
});
vi.mock("../useEmbarqueForm", async () => {
  const { useForm } = await import("react-hook-form");
  const mapper = await import("@/features/embarques/domain/mappers/embarqueToDbConceptos");
  return { useEmbarqueForm: () => {
    const methods = useForm({ defaultValues: {
      clienteId: "cli1", modo: "Terrestre", tipo: "Importación", contenedores: [],
      tipoCambioUSD: "20", tipoCambioEUR: "22", notas: "Sin cambios",
    } });
    return {
      methods, inicializarDesdeEmbarque: () => {}, handleMsdsUpload: vi.fn(),
      buildEmbarquePayload: () => ({ modo: "Terrestre", notas: methods.getValues("notas") }),
      buildConceptosVentaPayload: mapper.buildConceptosVentaPayload,
      buildConceptosCostoPayload: mapper.buildConceptosCostoPayload,
    };
  } };
});
vi.mock("@/features/configuracion/hooks/useMargenMinimo", () => ({ useMargenMinimo: () => 10 }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: m.error, notifySuccess: vi.fn() }));
vi.mock("../../services/evaluacionFiscalEmbarque", () => ({ prepararRevisionFiscalEmbarque: m.prepararRevision }));

beforeEach(() => {
  vi.clearAllMocks();
  const datos: Record<string, unknown> = {
    embarque: { id: "e1", expediente: "TEST-1", cliente_id: "cli1", modo: "Terrestre", tipo: "Importación", updated_at: "2026-11-14", shipper: null, consignatario: null },
    ventas: [venta], costos: [costo], contenedores: [],
    clientes: [{ id: "cli1", nombre: "Cliente sintético" }],
    proveedores: [{ id: "p1", nombre: "Proveedor sintético" }],
  };
  m.consultas = Object.fromEntries(Object.entries(datos).map(([key, data]) => [key, { data, isError: false, refetch: vi.fn() }]));
});

describe("edición segura tras cargar todos los datos", () => {
  it.each(["embarque", "ventas", "costos", "contenedores", "clientes", "proveedores"])("un error en %s bloquea guardado y reintenta esa consulta", async (key) => {
    const datos = m.consultas[key].data;
    Object.assign(m.consultas[key], { data: undefined, isError: true });
    const { result, rerender } = renderHook(() => useEditarEmbarqueWizard("e1"));
    expect(result.current.isError).toBe(true);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.errorCarga).toContain("Reintenta antes de guardar");
    await act(() => result.current.handleSave());
    expect(m.guardar).not.toHaveBeenCalled();
    expect(m.navegar).not.toHaveBeenCalled();
    await act(() => result.current.refetch());
    expect(m.consultas[key].refetch).toHaveBeenCalledOnce();
    for (const [nombre, query] of Object.entries(m.consultas)) {
      if (nombre !== key) expect(query.refetch).not.toHaveBeenCalled();
    }
    Object.assign(m.consultas[key], { data: datos, isError: false });
    rerender();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.methods.setValue("notas", "Cambio administrativo"));
    await act(() => result.current.handleSave());
    expect(m.guardar).toHaveBeenCalledOnce();
    expect(m.navegar).toHaveBeenCalledOnce();
    expect(m.guardar).toHaveBeenCalledWith(expect.objectContaining({
      conceptosVenta: [expect.objectContaining({ id: "v1" })],
      conceptosCosto: [expect.objectContaining({ id: "c1", proveedor_id: "p1" })],
      embarque: expect.objectContaining({ notas: "Cambio administrativo" }),
      expectedUpdatedAt: "2026-11-14",
    }));
  });

  it.each(["ventas", "costos", "contenedores", "proveedores"])("espera la consulta pendiente de %s", async (key) => {
    m.consultas[key].data = undefined;
    const { result } = renderHook(() => useEditarEmbarqueWizard("e1"));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isError).toBe(false);
    await act(() => result.current.handleSave());
    expect(m.guardar).not.toHaveBeenCalled();
  });

  it("permite guardar colecciones realmente vacías tras una carga exitosa", async () => {
    for (const key of ["ventas", "costos", "proveedores"]) m.consultas[key].data = [];
    const { result } = renderHook(() => useEditarEmbarqueWizard("e1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.handleSave());
    expect(m.guardar).toHaveBeenCalledWith(expect.objectContaining({ conceptosVenta: [], conceptosCosto: [] }));
  });

  it("conserva costos con proveedor histórico aunque el catálogo esté vacío", async () => {
    m.consultas.proveedores.data = [];
    const { result } = renderHook(() => useEditarEmbarqueWizard("e1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(() => result.current.handleSave());
    expect(m.guardar).toHaveBeenCalledWith(expect.objectContaining({ conceptosCosto: [expect.objectContaining({ id: "c1", proveedor_id: "p1" })] }));
  });

  it("no reemplaza ediciones locales al recuperar una consulta de fondo fallida", async () => {
    const { result, rerender } = renderHook(() => useEditarEmbarqueWizard("e1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => result.current.conceptosForm.updateConceptoVenta(1, "concepto", "Flete actualizado"));
    m.consultas.ventas.isError = true;
    rerender();
    await act(() => result.current.handleSave());
    expect(m.guardar).not.toHaveBeenCalled();
    m.consultas.ventas = { ...m.consultas.ventas, isError: false, data: [{ ...venta }] };
    rerender();
    await act(() => result.current.handleSave());
    expect(m.guardar).toHaveBeenCalledWith(expect.objectContaining({ conceptosVenta: [expect.objectContaining({ id: "v1", descripcion: "Flete actualizado" })] }));
  });

  it("mantiene el estado de expediente inexistente", () => {
    m.consultas.embarque.data = null;
    const { result } = renderHook(() => useEditarEmbarqueWizard("e1"));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.embarque).toBeNull();
  });

  it.each([false, true])("espera la revisión fiscal antes de guardar (confirmada: %s)", async (confirmada) => {
    const propuesta = { huella: "a".repeat(64), puede_autorizar: true };
    m.prepararRevision.mockResolvedValueOnce(propuesta);
    m.consultas.ventas.data = [{ ...venta, evaluacion_fiscal: { estado: "aplica" } }];
    const { result } = renderHook(() => useEditarEmbarqueWizard("e1"));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    let guardado: Promise<void>;
    act(() => { guardado = result.current.handleSave(); });
    await waitFor(() => expect(result.current.revisionFiscal).toEqual(propuesta));
    expect(m.guardar).not.toHaveBeenCalled();
    expect(result.current.isPending).toBe(true);
    const motivo = confirmada ? "Cambio fiscal confirmado" : null;
    await act(async () => {
      result.current.responderRevisionFiscal(motivo);
      await guardado;
    });
    if (confirmada) {
      expect(m.guardar).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        revisionFiscal: { huella: propuesta.huella, motivo },
        expectedUpdatedAt: "2026-11-14",
      }));
    } else {
      expect(m.guardar).not.toHaveBeenCalled();
    }
    expect(result.current.isPending).toBe(false);
  });
});

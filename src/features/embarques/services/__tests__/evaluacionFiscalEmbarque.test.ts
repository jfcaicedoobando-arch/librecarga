import { beforeEach, describe, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
import { consultarFiscalEmbarque, previsualizarFiscalEmbarque, validarRespuestaFiscalEmbarque } from "../evaluacionFiscalEmbarque";

export const snapshot = { schema_version: "cotizacion_fiscal_v1", estado: "confirmado", organization_id: "org-a", cliente_id: "cliente-a",
  perfil_id: "perfil-a", perfil_version: 1, regla_version: "resico_113j_v1", precision_version: "grouped", conceptos_fingerprint: "hash",
  ambiente: "sandbox", bloques: [{ moneda: "MXN", subtotal: 200.8, iva: 32.13, ret_isr: 2.51, ret_iva: 0, total: 230.42 }], motivos: [] };

describe("boundary fiscal embarque", () => {
  beforeEach(() => rpc.mockReset());
  it("rechaza otra organización, receptor discordante y totales corruptos", () => {
    expect(() => validarRespuestaFiscalEmbarque({ snapshot, conceptos: [] }, "org-b")).toThrow();
    expect(() => validarRespuestaFiscalEmbarque({ snapshot, conceptos: [] }, "org-a", "cliente-b")).toThrow();
    expect(() => validarRespuestaFiscalEmbarque({ snapshot: { ...snapshot, bloques: [{ ...snapshot.bloques[0], total: 230.40 }] }, conceptos: [] }, "org-a")).toThrow();
    expect(() => validarRespuestaFiscalEmbarque({ conceptos: [] }, "org-a")).toThrow();
  });
  it("conserva legacy null separado de no aplica y no recalcula el snapshot guardado", async () => {
    expect(validarRespuestaFiscalEmbarque({ snapshot: null, conceptos: [] }, "org-a")).toBeNull();
    rpc.mockResolvedValue({ data: { snapshot, conceptos: [] }, error: null });
    expect(await consultarFiscalEmbarque("emb-a", "org-a")).toEqual(snapshot);
    expect(rpc).toHaveBeenCalledWith("obtener_evaluacion_fiscal_embarque", { p_embarque_id: "emb-a" });
  });
  it("preview transmite contexto y bases sin activar ni inventar ISR desde el navegador", async () => {
    rpc.mockResolvedValue({ data: { snapshot, conceptos: [] }, error: null });
    await previsualizarFiscalEmbarque({ organizationId: "org-a", clienteId: "cliente-a", embarqueId: "emb-a",
      conceptos: [{ id: 1, concepto: "Flete", cantidad: 2, precioUnitario: 100.4, moneda: "MXN" }] });
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("evaluar_documento_isr_resico");
    expect(args).toMatchObject({ p_org_id: "org-a", p_cliente_id: "cliente-a", p_embarque_id: "emb-a", p_conceptos: [{ total: 200.8 }] });
    expect(args.p_conceptos[0]).not.toHaveProperty("evaluacion_fiscal");
    expect(args.p_conceptos[0]).not.toHaveProperty("tasa_ret_isr");
  });
});

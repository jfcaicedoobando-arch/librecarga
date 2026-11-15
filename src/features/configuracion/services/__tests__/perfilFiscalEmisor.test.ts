import { beforeEach, describe, expect, it, vi } from "vitest";
import { solicitarPerfilFiscal } from "../perfilFiscalEmisor";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
const body = { organization_id: "00000000-0000-4000-8000-000000000001", ambiente: "live", accion: "consultar" } as const;
const empty = { ambiente: "live", version: 0, estado: "sin_sincronizar", problemas: [], perfil: null };

describe("servicio de perfil fiscal", () => {
  beforeEach(() => vi.clearAllMocks());
  it("envía el ambiente y la organización sin datos fiscales editables", async () => {
    invoke.mockResolvedValue({ data: empty, error: null });
    await expect(solicitarPerfilFiscal(body)).resolves.toEqual(empty);
    expect(invoke).toHaveBeenCalledWith("facturapi-perfil-fiscal", { body });
  });
  it("rechaza una respuesta sandbox para una solicitud de producción", async () => {
    invoke.mockResolvedValue({ data: { ...empty, ambiente: "sandbox" }, error: null });
    await expect(solicitarPerfilFiscal(body)).rejects.toThrow("ambiente seleccionados");
  });
  it("rechaza payloads incompletos en lugar de presentarlos como ausencia de perfil", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    await expect(solicitarPerfilFiscal(body)).rejects.toThrow();
  });
  it.each(["organization_id", "ambiente"])("rechaza un perfil cuyo %s no coincide con la solicitud", async (field) => {
    const perfil = { id: "00000000-0000-4000-8000-000000000002", organization_id: body.organization_id,
      ambiente: body.ambiente, version: 1, facturapi_org_id: "org-provider", rfc: null, razon_social: null,
      tipo_persona: null, regimen_fiscal: null, codigo_postal: null, origen: "facturapi",
      sincronizado_at: "2026-11-15T12:00:00Z", confirmado_at: null, vigente_desde: null,
      [field]: field === "ambiente" ? "sandbox" : "00000000-0000-4000-8000-000000000003" };
    invoke.mockResolvedValue({ data: { ...empty, version: 1, perfil }, error: null });
    await expect(solicitarPerfilFiscal(body)).rejects.toThrow("organización y ambiente seleccionados");
  });
  it("muestra el error accionable de conflicto del servidor", async () => {
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ message: "La configuración cambió." }), { status: 409 }) } });
    await expect(solicitarPerfilFiscal(body)).rejects.toThrow("La configuración cambió.");
  });
});

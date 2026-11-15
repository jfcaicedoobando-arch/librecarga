import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DatosFiscalesEmisorCard from "../DatosFiscalesEmisorCard";

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), refetch: vi.fn(), allowed: true, org: "org-a",
  data: { estado: "sin_confirmar", problemas: [] as string[], version: 1, ambiente: "sandbox", perfil: {
    id: "perfil-1", version: 1, rfc: "GODE561231GR8", razon_social: "Emisor de prueba", tipo_persona: "fisica",
    regimen_fiscal: "626", codigo_postal: "01000", sincronizado_at: "2026-11-13T12:00:00Z", vigente_desde: null,
  } }, error: false }));
vi.mock("@/hooks/shared/useOrgActiva", () => ({ useOrgActiva: () => ({ organizationId: mocks.org }) }));
vi.mock("@/hooks/shared/usePermissions", () => ({ usePermissions: () => ({ canEmitirFactura: mocks.allowed }) }));
vi.mock("../../hooks/useFacturapiCredenciales", () => ({ useFacturapiCredenciales: () => ({ data: { ambiente: "sandbox" }, isPending: false, isError: false }) }));
vi.mock("../../hooks/usePerfilFiscalEmisor", () => ({ usePerfilFiscalEmisor: () => ({
  query: { data: mocks.data, isPending: false, isError: mocks.error, refetch: mocks.refetch },
  mutation: { mutate: mocks.mutate, isPending: false },
}) }));

describe("Datos fiscales del emisor", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.allowed = true; mocks.error = false; mocks.org = "org-a";
    mocks.data.estado = "sin_confirmar"; mocks.data.problemas = []; mocks.data.perfil.id = "perfil-1"; });
  afterEach(cleanup);
  it("muestra el régimen importado y sincroniza explícitamente", () => {
    render(<DatosFiscalesEmisorCard />);
    expect(screen.getByText("626 — Régimen Simplificado de Confianza")).toBeInTheDocument();
    expect(screen.getByText("Persona física")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sincronizar desde Facturapi" }));
    expect(mocks.mutate).toHaveBeenCalledWith({ accion: "sincronizar" });
  });
  it("exige revisar la constancia y descarta la aceptación al cambiar de versión", () => {
    const { rerender } = render(<DatosFiscalesEmisorCard />);
    const button = screen.getByRole("button", { name: "Confirmar datos fiscales" });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button);
    expect(mocks.mutate).toHaveBeenCalledWith({ accion: "confirmar", perfil_id: "perfil-1", vigente_desde: null });
    mocks.data.perfil.id = "perfil-2";
    rerender(<DatosFiscalesEmisorCard />);
    expect(screen.getByRole("button", { name: "Confirmar datos fiscales" })).toBeDisabled();
  });
  it("una discordancia elimina la confirmación y explica dónde corregirla", () => {
    mocks.data.estado = "requiere_revision"; mocks.data.problemas = ["rfc_empresa_discordante"];
    render(<DatosFiscalesEmisorCard />);
    expect(screen.getByText(/El RFC de Facturapi no coincide/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar datos fiscales" })).not.toBeInTheDocument();
  });
  it("un error de carga no muestra datos anteriores como vigentes", () => {
    mocks.error = true; render(<DatosFiscalesEmisorCard />);
    expect(screen.queryByText("GODE561231GR8")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.refetch).toHaveBeenCalled();
  });
  it("oculta la administración a roles sin permiso fiscal", () => {
    mocks.allowed = false; render(<DatosFiscalesEmisorCard />);
    expect(screen.queryByText("Datos fiscales del emisor")).not.toBeInTheDocument();
  });
  it("no interpreta una fecha inválida como vigencia vacía", () => {
    render(<DatosFiscalesEmisorCard />);
    fireEvent.click(screen.getByRole("checkbox"));
    const fecha = screen.getByLabelText("Vigente desde (opcional)");
    fireEvent.change(fecha, { target: { value: "31/02/2026" } });
    fireEvent.blur(fecha);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar datos fiscales" }));
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Corrige la fecha o deja el campo vacío.")).toBeInTheDocument();
    fireEvent.change(fecha, { target: { value: "15/11/2026" } });
    fireEvent.blur(fecha);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar datos fiscales" }));
    expect(mocks.mutate).toHaveBeenCalledWith({ accion: "confirmar", perfil_id: "perfil-1", vigente_desde: "2026-11-15" });
  });
});

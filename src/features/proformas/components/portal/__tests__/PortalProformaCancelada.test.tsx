import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalProforma from "../../../routes/PortalProforma";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), token: "synthetic" as string | undefined }));

vi.mock("react-router", () => ({ useParams: () => ({ token: mocks.token }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/components/shared/Seo", () => ({ Seo: () => null }));
vi.mock("@/components/shared/DetailHeader", () => ({ DetailHeader: () => null }));
vi.mock("@/features/proformas/components/portal/PortalProformaResumen", () => ({ PortalProformaResumen: () => <span>Detalle de importes</span> }));
vi.mock("@/features/proformas/components/portal/PortalProformaAcciones", () => ({ PortalProformaAcciones: () => <button>Aceptar proforma</button> }));

describe("estados del enlace público de proforma", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.token = "synthetic";
  });

  it("explica la cancelación y pide una nueva proforma sin acciones ni importes", async () => {
    mocks.rpc.mockResolvedValue({
      data: { estado_link: "cancelada", proforma: { id: "history", numero: "SYNTH" }, conceptos: [] },
      error: null,
    });
    render(<PortalProforma />);
    expect(await screen.findByText("Esta proforma fue cancelada")).toBeInTheDocument();
    expect(screen.getByText(/Solicita a tu ejecutivo una nueva proforma/)).toBeInTheDocument();
    expect(screen.queryByText("Detalle de importes")).toBeNull();
    expect(screen.queryByRole("button", { name: "Aceptar proforma" })).toBeNull();
  });

  it("ofrece reintentar cuando falla el servicio y carga la misma proforma", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { message: "Detalle interno" } })
      .mockResolvedValueOnce({ data: { estado_link: "activo", proforma: { id: "demo" } }, error: null });
    render(<PortalProforma />);
    expect(await screen.findByText(/El servicio no está disponible/)).toBeInTheDocument();
    expect(screen.queryByText("Detalle interno")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Detalle de importes")).toBeInTheDocument();
    expect(mocks.rpc.mock.calls).toEqual([
      ["portal_obtener_proforma_por_token", { p_token: "synthetic" }],
      ["portal_obtener_proforma_por_token", { p_token: "synthetic" }],
    ]);
  });

  it("pide un enlace nuevo cuando el servicio indica token inválido", async () => {
    mocks.rpc.mockResolvedValue({ data: { error: "token_invalido" }, error: null });
    render(<PortalProforma />);
    expect(await screen.findByText(/Este enlace ya no es válido/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument();
  });

  it("trata un enlace sin token como inválido sin llamar al servicio", async () => {
    mocks.token = undefined;
    render(<PortalProforma />);
    expect(await screen.findByText(/Este enlace ya no es válido/)).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

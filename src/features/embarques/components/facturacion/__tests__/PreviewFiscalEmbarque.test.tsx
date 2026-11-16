import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const mocks = vi.hoisted(() => ({ preview: vi.fn(), auth: { organizationId: "org-a", user: { id: "user-a" } } }));
vi.mock("@/lib/contexts/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/hooks/shared/useOrgFilter", () => ({ useOrgFilter: () => ({ organizationId: mocks.auth.organizationId, orgListo: true }) }));
vi.mock("../../../services/evaluacionFiscalEmbarque", () => ({ previsualizarFiscalEmbarque: mocks.preview }));
import { PreviewFiscalEmbarque } from "../PreviewFiscalEmbarque";

const snapshot = { schema_version: "cotizacion_fiscal_v1", estado: "confirmado", organization_id: "org-a", cliente_id: "cliente-a",
  perfil_id: "perfil-a", perfil_version: 1, regla_version: "resico_113j_v1", precision_version: "grouped", conceptos_fingerprint: "hash",
  ambiente: "sandbox", bloques: [{ moneda: "MXN", subtotal: 200.8, iva: 32.13, ret_isr: 2.51, ret_iva: 0, total: 230.42 }], motivos: [] };
const conceptos = [{ id: 1, concepto: "Flete", cantidad: 2, precioUnitario: 100.4, moneda: "MXN" }];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (clienteId = "cliente-a", filas = conceptos) => <QueryClientProvider client={client}><PreviewFiscalEmbarque conceptos={filas} clienteId={clienteId} embarqueId="emb-a" /></QueryClientProvider>;
  return { ...render(view()), view, client };
}

describe("preview fiscal embarque", () => {
  beforeEach(() => { mocks.preview.mockReset(); mocks.auth.organizationId = "org-a"; mocks.auth.user.id = "user-a"; });
  it.each(["cliente", "conceptos", "organizacion", "usuario"])("descarta una respuesta diferida al cambiar %s", async (cambio) => {
    let resolve!: (value: unknown) => void;
    mocks.preview.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { rerender, view, client } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar desglose fiscal" }));
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1));
    if (cambio === "organizacion") mocks.auth.organizationId = "org-b";
    if (cambio === "usuario") mocks.auth.user.id = "user-b";
    rerender(view(cambio === "cliente" ? "cliente-b" : "cliente-a", cambio === "conceptos" ? [{ ...conceptos[0], precioUnitario: 300 }] : conceptos));
    await act(async () => resolve(snapshot));
    expect(screen.queryByRole("region", { name: "Desglose fiscal del embarque" })).not.toBeInTheDocument();
    expect(screen.getByText(/Actualiza el desglose fiscal con los datos actuales/)).toBeInTheDocument();
    client.clear();
  });
  it("muestra el desglose canónico y lo retira al editar importes", async () => {
    mocks.preview.mockResolvedValue(snapshot);
    const { rerender, view, client } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar desglose fiscal" }));
    expect(await screen.findByText("ISR retenido")).toBeInTheDocument();
    expect(screen.getByText("IVA retenido")).toBeInTheDocument();
    expect(screen.getByText("Total neto")).toBeInTheDocument();
    rerender(view("cliente-a", [{ ...conceptos[0], cantidad: 3 }]));
    expect(screen.queryByText("Total neto")).not.toBeInTheDocument();
    client.clear();
  });
});

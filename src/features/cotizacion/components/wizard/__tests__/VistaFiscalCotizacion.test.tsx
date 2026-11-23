import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fiscalCotizacionFixture } from "@/test/fixtures/snapshotFiscalCotizacion";
import type { ConceptoVentaCotizacion } from "../../../types";

const { evaluar } = vi.hoisted(() => ({ evaluar: vi.fn() }));
vi.mock("../../../services/evaluarFiscalCotizacion", () => ({ evaluarFiscalCotizacion: evaluar }));
vi.mock("../../../hooks/wizard/usePricingScope", () => ({
  usePricingScope: () => ({ organizationId: "org-a", userId: "user-a", generation: 1 }),
}));

import { VistaFiscalCotizacion } from "../VistaFiscalCotizacion";

const lineas: ConceptoVentaCotizacion[] = ["Flete", "Maniobras"].map((descripcion) => ({
  descripcion, cantidad: 1, precio_unitario: 100.4, moneda: "MXN", unidad_medida: "Servicio",
  total: 116.46, aplica_iva: true, tasa_iva_aplicada: 0.16, tipo_iva: "gravado_16",
}));

describe("vista fiscal de la cotización", () => {
  it("reintenta el mismo cálculo sin editar conceptos", async () => {
    evaluar.mockRejectedValueOnce(new Error("sin conexión"))
      .mockResolvedValueOnce(fiscalCotizacionFixture({ cliente_id: "cliente-qa" }));
    const client = new QueryClient();
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <VistaFiscalCotizacion clienteId="cliente-qa" cotizacionId="cot-qa" conceptos={lineas}>
          {(resumen) => resumen}
        </VistaFiscalCotizacion>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar cálculo fiscal" }));
    expect(await screen.findByText(/230\.42/)).toBeInTheDocument();
    expect(evaluar.mock.calls[0][0].conceptos).toEqual(evaluar.mock.calls[1][0].conceptos);
    unmount();
    client.clear();
  });
  it("muestra el total agrupado y descarta una respuesta del receptor anterior", async () => {
    let finalizarAnterior!: (snapshot: unknown) => void;
    evaluar.mockImplementation(({ clienteId }) => clienteId === "cliente-anterior"
      ? new Promise((resolve) => { finalizarAnterior = resolve; })
      : Promise.resolve(fiscalCotizacionFixture({ cliente_id: "cliente-actual" })));
    const client = new QueryClient();
    const vista = (clienteId: string) => (
      <QueryClientProvider client={client}>
        <VistaFiscalCotizacion clienteId={clienteId} cotizacionId="cot-qa" conceptos={lineas}>
          {(resumen) => resumen ?? <p>Total anterior</p>}
        </VistaFiscalCotizacion>
      </QueryClientProvider>
    );

    const { rerender, unmount } = render(vista("cliente-anterior"));
    await waitFor(() => expect(evaluar).toHaveBeenCalledWith(expect.objectContaining({ clienteId: "cliente-anterior" })));
    rerender(vista("cliente-actual"));
    expect(await screen.findByText(/230\.42/)).toBeInTheDocument();
    expect(screen.getByText(/2\.51/)).toBeInTheDocument();
    await act(async () => finalizarAnterior(fiscalCotizacionFixture({
      cliente_id: "cliente-anterior", bloques: [{ moneda: "MXN", subtotal: 100, iva: 16, ret_isr: 1.25, ret_iva: 0, total: 114.75 }],
    })));
    expect(screen.queryByText(/114\.75/)).not.toBeInTheDocument();
    unmount();
    client.clear();
  });
});

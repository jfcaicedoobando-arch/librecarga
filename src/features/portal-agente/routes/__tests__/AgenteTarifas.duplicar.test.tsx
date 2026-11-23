import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import AgenteTarifas from "../AgenteTarifas";
import type { ErrorNotifyOptions } from "@/lib/ui/appFeedback";

const { fetchRecargos, notifyError, editor } = vi.hoisted(() => ({
  fetchRecargos: vi.fn(),
  notifyError: vi.fn((_toast: undefined, _options: ErrorNotifyOptions) => undefined),
  editor: vi.fn(),
}));

vi.mock("@/features/costeo/services/topTarifas", () => ({
  fetchRecargosDeTarifa: fetchRecargos,
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError }));
vi.mock("@/features/portal-agente/components/AgenteTarifaForm", () => ({
  AgenteTarifaForm: (props: unknown) => { editor(props); return null; },
}));
vi.mock("@/features/portal-agente/hooks", () => ({
  useAgenteTarifas: () => ({ data: [{
    id: "t1",
    naviera_nombre: "MAERSK",
    puerto_origen_nombre: "Shanghai",
    puerto_destino_nombre: "Manzanillo",
    tipo_contenedor_nombre: "40HC",
    moneda: "USD",
    flete_base: 1500,
    vigente_desde: "2026-07-01",
    vigente_hasta: "2026-12-31",
    estado_aprobacion: "vigente",
  }] }),
}));

describe("AgenteTarifas · duplicar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("espera los recargos antes de abrir la copia y reintenta la misma tarifa tras un fallo", async () => {
    fetchRecargos.mockRejectedValueOnce(new Error("Sin conexión")).mockResolvedValueOnce([
      { id: "r1", concepto: "BAF", lado: "origen", monto: "175", moneda: "USD", incluido_en_total: true },
      { id: "r2", concepto: "ISPS", lado: "destino", monto: "25", moneda: "USD", incluido_en_total: false },
    ]);
    render(<MemoryRouter><AgenteTarifas /></MemoryRouter>);
    fireEvent.keyDown(screen.getByRole("button", { name: /Acciones de la tarifa/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Duplicar como nueva" }));

    await waitFor(() => expect(notifyError).toHaveBeenCalledTimes(1));
    expect(editor).not.toHaveBeenCalledWith(expect.objectContaining({ open: true }));
    const opciones = notifyError.mock.calls[0][1];
    expect(opciones.title).toBe("No se pudieron cargar los recargos de la tarifa");
    expect(opciones.action?.label).toBe("Reintentar");
    opciones.action?.onClick();

    await waitFor(() => expect(editor).toHaveBeenCalledWith(expect.objectContaining({
      open: true,
      modo: "duplicar",
      initial: expect.objectContaining({
        recargos: [
          { concepto: "BAF", lado: "origen", monto: 175, moneda: "USD", incluido_en_total: true, base: "por_unidad" },
          { concepto: "ISPS", lado: "destino", monto: 25, moneda: "USD", incluido_en_total: false, base: "por_unidad" },
        ],
      }),
    })));
    expect(fetchRecargos.mock.calls).toEqual([["t1"], ["t1"]]);
  });
});

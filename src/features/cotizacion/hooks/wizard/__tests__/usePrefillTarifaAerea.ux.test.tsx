import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CotizacionFormValues } from "@/features/cotizacion/types";
import { fetchPrefillTarifaAerea, type PrefillTarifaAerea } from "@/features/cotizacion/services/prefillTarifaAerea";
import { usePrefillTarifaAerea } from "../usePrefillTarifaAerea";

vi.mock("@/features/cotizacion/services/prefillTarifaAerea", () => ({ fetchPrefillTarifaAerea: vi.fn() }));

const tarifa: PrefillTarifaAerea = {
  tarifaId: "tarifa-pricing", moneda: "USD", modo: "Aéreo", origen: "MEX", destino: "LAX",
  vigenteHasta: "2026-12-10", pesoKg: 50, volumenM3: 1, commodity: "Carga sintética",
  tipoUnidad: null, puntoIntermedio: null,
  banderasAereas: { baterias_litio: false, known_shipper: true, tipo_aeronave: "CAO" },
};

function mostrar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => {
    const form = useForm<CotizacionFormValues>({ defaultValues: { tarifaId: null } });
    return { form, prefill: usePrefillTarifaAerea(form, "org-prueba", tarifa.tarifaId, "solicitud-prueba", true) };
  }, { wrapper });
}

beforeEach(() => vi.mocked(fetchPrefillTarifaAerea).mockReset());

describe("estado de precarga de una tarifa de Pricing", () => {
  it.each([false, true])("recupera el fallo y respeta una tarifa manual (existente: %s)", async (manual) => {
    vi.mocked(fetchPrefillTarifaAerea).mockRejectedValueOnce(new Error("Red de prueba")).mockResolvedValueOnce(tarifa);
    const { result } = mostrar();
    expect(result.current.prefill?.estado).toBe("cargando");
    await waitFor(() => expect(result.current.prefill?.estado).toBe("error"));
    const error = result.current.prefill;
    if (error?.estado !== "error") throw new Error("Se esperaba un error recuperable");
    if (manual) act(() => result.current.form.setValue("tarifaId", "tarifa-manual"));
    await act(async () => error.reintentar());
    await waitFor(() => expect(result.current.prefill).toBeNull());
    expect(result.current.form.getValues("tarifaId")).toBe(manual ? "tarifa-manual" : tarifa.tarifaId);
    if (!manual) expect(result.current.form.getValues("banderasAereas")).toEqual(tarifa.banderasAereas);
    expect(vi.mocked(fetchPrefillTarifaAerea).mock.calls).toEqual([
      ["org-prueba", tarifa.tarifaId, "solicitud-prueba"], ["org-prueba", tarifa.tarifaId, "solicitud-prueba"],
    ]);
  });
});

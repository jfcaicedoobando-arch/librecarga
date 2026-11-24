import { renderHook } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";
import { COTIZACION_FORM_DEFAULTS, type CotizacionFormValues } from "@/features/cotizacion/types";
import { useSugerenciasTarifaInline } from "../useSugerenciasTarifaInline";

const m = vi.hoisted(() => ({ top: vi.fn(), lista: false, fecha: "2099-12-10" }));
vi.mock("@/features/catalogos/hooks", () => ({ usePuertos: () => ({ data: [] }), useTiposContenedor: () => ({ data: [] }) }));
vi.mock("@/features/costeo/hooks/useTopTarifas", () => ({ useTopTarifas: (args: unknown) => {
  m.top(args); return { data: [], isFetching: false, isRefetching: false, error: null, refetch: vi.fn() };
} }));
vi.mock("@/features/crm/hooks/usePricingCrm", () => ({ useSolicitudPricing: () => ({
  isSuccess: m.lista, isPending: !m.lista, isError: false, refetch: vi.fn(),
  data: m.lista ? { fecha_tentativa_carga: m.fecha } : undefined,
}) }));
vi.mock("@/features/cotizacion/services/bitacoraTarifa", () => ({ logTarifaSugeridaAplicada: vi.fn() }));

function Wrapper({ children }: PropsWithChildren) {
  const form = useForm<CotizacionFormValues>({ defaultValues: {
    ...COTIZACION_FORM_DEFAULTS, pricingSolicitudId: "solicitud", puertoOrigenId: "origen", puertoDestinoId: "destino",
  } });
  return <FormProvider {...form}>{children}</FormProvider>;
}

describe("cambiar tarifa desde una cotización ligada a Pricing", () => {
  it("espera la solicitud y usa su fecha de carga en lugar de consultar hoy", () => {
    m.top.mockClear(); m.lista = false;
    const { result, rerender } = renderHook(() => useSugerenciasTarifaInline({ onElegirTarifa: vi.fn() }), { wrapper: Wrapper });
    expect(m.top).toHaveBeenLastCalledWith(expect.objectContaining({ puertoOrigenId: "" }));
    expect(result.current.isFetching).toBe(true);
    m.lista = true;
    rerender();
    expect(m.top).toHaveBeenLastCalledWith(expect.objectContaining({ puertoOrigenId: "origen", fecha: "2099-12-10" }));
    expect(result.current.fecha).toBe("2099-12-10");
  });
});
import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { usePortalEmbarqueDetalleController } from "../usePortalEmbarqueDetalleController";

const portal = vi.hoisted(() => ({ useEmbarque: vi.fn() }));
vi.mock("@/features/portal/hooks/usePortalData", () => ({
  usePortalEmbarque: portal.useEmbarque,
  usePortalEventos: () => ({ data: [] }),
  usePortalDocumentos: () => ({ data: [] }),
}));

it.each([["Cancelado", -1], ["Borrador", -1], ["Confirmado", 0], ["En Tránsito", 1], ["Cerrado", 5]])(
  "muestra el progreso que corresponde al estado %s",
  (estado, indice) => {
    portal.useEmbarque.mockReturnValue({ data: { estado, modo: "Marítimo", tipo: "Importación" } });
    const { result } = renderHook(() => usePortalEmbarqueDetalleController("e1"));
    expect(result.current.currentStepIndex).toBe(indice);
  },
);

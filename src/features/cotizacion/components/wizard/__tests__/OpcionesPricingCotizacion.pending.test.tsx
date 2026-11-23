import { act, fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { expect, it, vi } from "vitest";
import type { CotizacionFormValues } from "@/features/cotizacion/types";
import { OpcionesPricingCotizacion } from "../OpcionesPricingCotizacion";

const elegir = vi.hoisted(() => vi.fn());
vi.mock("@/features/cotizacion/hooks/wizard/usarOpcionPricing", () => ({ usarOpcionPricing: elegir }));
vi.mock("@/features/cotizacion/hooks/wizard/useOpcionesPricingCotizacion", () => ({
  useOpcionesPricingCotizacion: () => ({
    data: [
      { solicitudId: "s1", tarifa: { id: "t1", flete_base: 100 } },
      { solicitudId: "s2", tarifa: { id: "t2", flete_base: 200 } },
    ],
  }),
}));

function Vista() {
  return <OpcionesPricingCotizacion form={useForm<CotizacionFormValues>()} />;
}

it("impide elegir otra tarifa mientras se verifica la opción activa", async () => {
  let liberar!: () => void;
  elegir.mockReturnValueOnce(new Promise<void>((resolve) => { liberar = resolve; }));
  render(<Vista />);
  fireEvent.click(screen.getByRole("button", { name: "Usar respuesta de Pricing" }));
  const [primera, segunda] = screen.getAllByRole("button", { name: "Usar en la cotización" });
  fireEvent.click(primera);
  expect(screen.getByRole("button", { name: "Verificando tarifa…" })).toBeDisabled();
  expect(segunda).toBeDisabled();
  fireEvent.click(segunda);
  expect(elegir).toHaveBeenCalledOnce();
  await act(async () => { liberar(); });
  expect(screen.getByRole("button", { name: "Usar respuesta de Pricing" })).toBeVisible();
});

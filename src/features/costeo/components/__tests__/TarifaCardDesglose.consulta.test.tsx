import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TarifaCardDesglose } from "../TarifaCardDesglose";

const { consulta, reintentar } = vi.hoisted(() => ({ consulta: vi.fn(), reintentar: vi.fn() }));
vi.mock("@/features/costeo/hooks/useRecargosDeTarifa", () => ({ useRecargosDeTarifa: consulta }));

describe("desglose de recargos del Top 3", () => {
  it("distingue una consulta fallida y permite recuperar sólo el desglose", () => {
    consulta.mockReturnValue({ isError: true, refetch: reintentar });
    const { rerender } = render(<TarifaCardDesglose tarifaId="tarifa-1" />);
    expect(consulta).toHaveBeenCalledWith("tarifa-1");
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron consultar los recargos");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reintentar).toHaveBeenCalledOnce();

    consulta.mockReturnValue({ data: [{ id: "recargo-1", concepto: "BAF", lado: "origen", monto: 15 }] });
    rerender(<TarifaCardDesglose tarifaId="tarifa-1" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver desglose (1 recargo)" }));
    expect(screen.getByText("BAF (origen)")).toBeVisible();
  });
});

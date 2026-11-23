import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConceptoVentaRow } from "../../types/embarque";
import type { EmbarqueContenedor } from "../../types/contenedor";
import { TabPnlContenedor } from "../TabPnlContenedor";

const consulta = vi.hoisted(() => ({ useContenedoresEmbarque: vi.fn() }));
vi.mock("@/features/embarques/hooks/useContenedoresEmbarque", () => consulta);

describe("TabPnlContenedor", () => {
  it("suspende el desglose atribuido mientras falla la consulta y lo recupera al reintentar", () => {
    const refetch = vi.fn();
    const contenedor = { id: "c-1", orden: 1, numero_contenedor: "ABCD1234567", tipo_contenedor: "40HC" } as EmbarqueContenedor;
    const venta = { contenedor_id: contenedor.id, moneda: "USD", total: 123 } as ConceptoVentaRow;
    consulta.useContenedoresEmbarque.mockReturnValue({ isError: true, refetch });
    const vista = () => <TabPnlContenedor embarqueId="e-1" expediente="EXP-1" conceptosVenta={[venta]} conceptosCosto={[]} />;
    const { rerender } = render(vista());
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los contenedores");
    expect(screen.queryByText("Presupuesto")).not.toBeInTheDocument();
    expect(screen.queryByText("Origen del prorrateo")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();

    consulta.useContenedoresEmbarque.mockReturnValue({ isError: false, data: [contenedor] });
    rerender(vista());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("ABCD1234567")).toBeInTheDocument();
  });
});

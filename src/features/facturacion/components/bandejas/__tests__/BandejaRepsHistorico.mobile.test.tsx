import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FilaRepHistorico } from "@/features/facturacion/hooks/useBandejas";
import { BandejaRepsHistorico } from "../BandejaRepsHistorico";

const { paged, consultar } = vi.hoisted(() => ({ paged: vi.fn(), consultar: vi.fn() }));
vi.mock("@/hooks/shared", () => ({ useOrgFilter: () => ({ organizationId: "demo" }), useIsMobile: () => true }));
vi.mock("@/features/facturacion/hooks/useBandejas", () => ({ useRepsHistorico: paged }));
vi.mock("@/features/facturacion/hooks/useConsultarRep", () => ({ useConsultarRep: consultar }));
vi.mock("@/features/facturacion/services/descargarCfdiFacturapi", () => ({ descargarCfdiFacturapi: vi.fn() }));
vi.mock("@/components/shared/dataTable/ResponsiveDataTable", () => ({
  ResponsiveDataTable: ({ data, mobileCard, emptyState }: {
    data: FilaRepHistorico[]; mobileCard: (row: FilaRepHistorico) => ReactNode; emptyState: ReactNode;
  }) => data.length ? <>{data.map((row) => <div key={row.id}>{mobileCard(row)}</div>)}</> : emptyState,
}));

const resetAll = vi.fn();
const estado = { search: "", activeChips: [], activeCount: 0, count: 0, rows: [], resetAll };
const rep = { id: "rep1", folio_rep: "R-01", factura_numero: "F-01", cliente_nombre: "Cliente de prueba",
  fecha_pago: "2026-11-04", monto: 100, moneda: "MXN", rep_cancellation_status: "verifying" };

describe("Histórico de complementos de pago", () => {
  it("ofrece consultar el SAT en móvil para una cancelación en trámite", () => {
    paged.mockReturnValue({ ...estado, rows: [rep], count: 1 });
    const mutate = vi.fn();
    consultar.mockReturnValue({ mutate, isPending: false });
    const { rerender } = render(<BandejaRepsHistorico />);
    expect(screen.getByText("En cancelación")).toBeInTheDocument();
    const boton = screen.getByRole("button", { name: "Actualizar estado ante el SAT del REP R-01" });
    fireEvent.click(boton);
    expect(mutate).toHaveBeenCalledWith("rep1");

    consultar.mockReturnValue({ mutate, isPending: true, variables: "rep1" });
    rerender(<BandejaRepsHistorico />);
    expect(boton).toBeDisabled();
    paged.mockReturnValue({ ...estado, rows: [{ ...rep, rep_cancellation_status: "accepted" }], count: 1 });
    rerender(<BandejaRepsHistorico />);
    expect(screen.queryByRole("button", { name: /Actualizar estado ante el SAT/ })).not.toBeInTheDocument();
  });

  it("distingue búsqueda sin resultados de un histórico sin timbrados", () => {
    consultar.mockReturnValue({ mutate: vi.fn(), isPending: false });
    paged.mockReturnValue({ ...estado, search: "sin coincidencias", activeCount: 1 });
    const { rerender } = render(<BandejaRepsHistorico />);
    expect(screen.getByText("Ningún REP coincide con los filtros.")).toBeInTheDocument();
    const vacio = screen.getByText("Ningún REP coincide con los filtros.").parentElement!;
    fireEvent.click(within(vacio).getByRole("button", { name: "Limpiar filtros" }));
    expect(resetAll).toHaveBeenCalledOnce();
    paged.mockReturnValue(estado);
    rerender(<BandejaRepsHistorico />);
    expect(screen.getByText("Aún no hay complementos de pago (REP) timbrados.")).toBeInTheDocument();
  });
});

/**
 * Pulido visual CRM: LeadLineageCard debe formatear la fecha estimada de cierre
 * con el formateador canónico, nunca mostrar ISO crudo, y conservar "—" para
 * valores nulos.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const leadLineage = vi.fn();
const oportunidadLineage = vi.fn();

vi.mock("@/features/crm/hooks", () => ({
  useLeadLineage: (leadId: string) => leadLineage(leadId),
  useOportunidadLineage: () => oportunidadLineage(),
}));

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));

vi.mock("@/components/shared/dataTable/DrilldownRow", () => ({
  DrilldownRow: ({ children, href, ariaLabel }: { children: React.ReactNode; href: string; ariaLabel: string }) => (
    <a href={href} aria-label={ariaLabel}>{children}</a>
  ),
}));

import { LeadLineageCard, OportunidadLineageCard } from "@/features/crm/components/LineageCard";

beforeEach(() => {
  leadLineage.mockReset();
  oportunidadLineage.mockReset();
});

it("el vínculo de la cotización abre el detalle de lectura", () => {
  oportunidadLineage.mockReturnValue({
    cots: [{ id: "cot-1", folio: "COT-1", estado: "Aceptada", modo: "Marítimo" }],
    embs: [], lead: null, isLoadingCots: false,
  });
  render(<OportunidadLineageCard oportunidadId="op-1" leadId={null} />);
  expect(screen.getByRole("link", { name: "Ver cotización COT-1" })).toHaveAttribute("href", "/cotizaciones/cot-1");
});

describe("LeadLineageCard — formato de fechas", () => {
  it("no renderiza la fecha ISO cruda y muestra formato dd/MM/yyyy", () => {
    leadLineage.mockReturnValue({
      data: [
        {
          id: "op-1",
          nombre: "Oportunidad uno",
          monto_estimado: 150000,
          moneda: "MXN",
          probabilidad: 60,
          fecha_estimada_cierre: "2026-12-25",
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<LeadLineageCard leadId="l-1" />);

    expect(screen.getByText(/25\/12\/2026/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-12-25/)).toBeNull();
  });

  it("muestra '—' cuando la fecha estimada es nula", () => {
    leadLineage.mockReturnValue({
      data: [
        {
          id: "op-2",
          nombre: "Oportunidad dos",
          monto_estimado: 0,
          moneda: "MXN",
          probabilidad: 0,
          fecha_estimada_cierre: null,
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<LeadLineageCard leadId="l-1" />);

    expect(screen.getByText(/cierre —/)).toBeInTheDocument();
    expect(screen.queryByText(/\d{4}-\d{2}-\d{2}/)).toBeNull();
  });
});

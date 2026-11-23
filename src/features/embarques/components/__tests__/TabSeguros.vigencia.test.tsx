import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { SeguroEmbarque } from "@/features/embarques/services/seguros";
import { formatDate } from "@/lib/formatters";
import { TabSeguros } from "../TabSeguros";

const { useSegurosEmbarque } = vi.hoisted(() => ({ useSegurosEmbarque: vi.fn() }));

vi.mock("@/features/embarques/hooks/useSegurosEmbarque", () => ({
  useSegurosEmbarque,
  useDeleteSeguro: () => ({ isPending: false }),
}));
vi.mock("../DialogSeguroForm", () => ({ DialogSeguroForm: () => null }));
vi.mock("@/lib/date/today", () => ({ todayLocalISO: () => "2026-10-06" }));

const base: SeguroEmbarque = {
  id: "inicia-manana", embarque_id: "emb", organization_id: "org",
  aseguradora: "Seguro de prueba", numero_poliza: "Póliza futura",
  certificado_url: null, cobertura_descripcion: null,
  suma_asegurada: 1000, deducible: 10, prima: 100, moneda: "MXN",
  vigencia_desde: "2026-10-07", vigencia_hasta: "2026-10-10",
  contacto: null, notas: null, proveedor_factura_id: null,
  created_at: "2026-10-06", updated_at: "2026-10-06",
};

it("identifica la cobertura futura y cuenta sólo la póliza que ya inició en el aviso", () => {
  useSegurosEmbarque.mockReturnValue({ data: [
    base,
    { ...base, id: "inicia-hoy", numero_poliza: "Póliza actual", vigencia_desde: "2026-10-06" },
  ] });
  render(<TabSeguros embarqueId="emb" canEdit={false} />);

  const futura = within(screen.getByRole("row", { name: /Póliza futura/ }));
  expect(futura.getByText(`Inicia el ${formatDate(base.vigencia_desde)}`)).toBeInTheDocument();
  expect(futura.queryByText(/Vence en|Vigente/)).not.toBeInTheDocument();

  const actual = within(screen.getByRole("row", { name: /Póliza actual/ }));
  expect(actual.getByText("Vence en 4d")).toBeInTheDocument();
  expect(screen.getByText("1 por vencer en 7 días")).toBeInTheDocument();
});

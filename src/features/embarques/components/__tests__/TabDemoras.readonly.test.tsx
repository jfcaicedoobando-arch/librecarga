import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TabDemoras } from "../TabDemoras";

const { setDraft } = vi.hoisted(() => ({ setDraft: vi.fn() }));
vi.mock("@/features/catalogos/hooks", () => ({ useTiposContenedor: () => ({ data: [] }) }));
vi.mock("@/features/embarques/hooks/useTabDemorasController", () => ({
  useTabDemorasController: () => ({
    rows: [{
      id: "contenedor-1",
      orden: 1,
      numero_contenedor: "TEST001",
      tipo_contenedor: "DV40",
      fecha_descarga: "2026-10-11",
      fecha_devolucion: "2026-10-13",
      dias_libres_override: null,
    }],
    drafts: {},
    setDraft,
    valorActual: (row: Record<string, unknown>, field: string) => row[field],
  }),
}));

it("conserva fechas de consulta y sólo ofrece calendarios a quien puede editar", () => {
  const vista = render(<TabDemoras embarqueId="emb" canEdit={false} />);
  expect(screen.getByText("11/10/2026")).toBeInTheDocument();
  expect(screen.getByText("13/10/2026")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /calendario de descarga/ })).not.toBeInTheDocument();
  expect(setDraft).not.toHaveBeenCalled();

  vista.rerender(<TabDemoras embarqueId="emb" canEdit />);
  expect(screen.getByRole("textbox", { name: "Fecha de descarga, contenedor TEST001" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Abrir calendario de descarga, contenedor TEST001" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Abrir calendario de devolución, contenedor TEST001" })).toBeEnabled();
});

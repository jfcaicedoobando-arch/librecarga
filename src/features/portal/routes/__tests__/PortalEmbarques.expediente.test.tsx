import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import PortalEmbarques from "../PortalEmbarques";

vi.mock("@/features/portal/hooks/usePortalData", () => ({
  usePortalClientUsers: () => ({ data: [{ cliente_id: "cliente-1" }] }),
  usePortalEmbarques: () => ({ data: embarques }),
}));
vi.mock("@/hooks/shared", async (original) => ({
  ...await original<typeof import("@/hooks/shared")>(),
  useIsMobile: () => false,
}));

const base = { cliente_nombre: "Cliente prueba", modo: "Marítimo", tipo: "Importación", estado: "Confirmado" };
const embarques = [
  { ...base, id: "sin-uno", expediente: null, puerto_origen: "Lázaro Cárdenas", puerto_destino: "Shanghái" },
  { ...base, id: "sin-dos", expediente: "", puerto_origen: "Veracruz", puerto_destino: "Valencia" },
  { ...base, id: "sin-tres", expediente: "  ", puerto_origen: "Manzanillo", puerto_destino: "Busan" },
  { ...base, id: "con-uno", expediente: "EXP-123", puerto_origen: "Altamira", puerto_destino: "Houston" },
  { ...base, id: "con-dos", expediente: "EXP-123", puerto_origen: "Altamira", puerto_destino: "Houston" },
];

describe("Portal Embarques sin expediente", () => {
  it("muestra cada ruta en su propia tarjeta y conserva el grupo con expediente real", () => {
    render(<MemoryRouter initialEntries={["/portal/embarques"]}><PortalEmbarques /></MemoryRouter>);

    expect(screen.getByRole("button", { name: /EXP-123.*2 contenedores/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /contenedores/ })).toHaveLength(1);
    for (const embarque of embarques.slice(0, 3)) {
      const tarjeta = screen.getByRole("link", { name: `Ver embarque Sin folio (${embarque.id})` });
      expect(within(tarjeta).getByText(`${embarque.puerto_origen} → ${embarque.puerto_destino}`)).toBeInTheDocument();
    }
  });
});

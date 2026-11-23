import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import PortalEmbarques from "../PortalEmbarques";
import PortalFacturas from "../PortalFacturas";
import PortalCotizaciones from "../PortalCotizaciones";

const { usePortalClientUsers } = vi.hoisted(() => ({ usePortalClientUsers: vi.fn() }));

vi.mock("@/features/portal/hooks/usePortalData", () => ({
  usePortalClientUsers,
  usePortalFacturas: () => ({ data: [] }),
  usePortalCotizaciones: () => ({ data: [] }),
  usePortalEmbarques: () => ({ data: embarques }),
}));
vi.mock("@/hooks/shared", async (original) => ({
  ...await original<typeof import("@/hooks/shared")>(),
  useIsMobile: () => false,
}));

vi.mock("@/features/catalogos/hooks/useTasaIVA", () => ({ useTasaIVA: () => 0.16 }));

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
    usePortalClientUsers.mockReturnValue({ data: [{ cliente_id: "cliente-1" }] });
    render(<MemoryRouter initialEntries={["/portal/embarques"]}><PortalEmbarques /></MemoryRouter>);

    expect(screen.getByRole("button", { name: /EXP-123.*2 embarques/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /\b\d+ embarques\b/ })).toHaveLength(1);
    for (const embarque of embarques.slice(0, 3)) {
      const tarjeta = screen.getByRole("link", { name: `Ver embarque Sin folio (${embarque.id})` });
      expect(within(tarjeta).getByText(`${embarque.puerto_origen} → ${embarque.puerto_destino}`)).toBeInTheDocument();
    }
  });

  it.each([
    { Pagina: PortalEmbarques, titulo: "Mis Embarques" },
    { Pagina: PortalFacturas, titulo: "Mis facturas" },
    { Pagina: PortalCotizaciones, titulo: "Mis cotizaciones" },
  ])("recupera cuentas vinculadas desde $titulo", ({ Pagina, titulo }) => {
    const refetch = vi.fn();
    usePortalClientUsers.mockReturnValue({ isError: true, refetch });
    render(<MemoryRouter><Pagina /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: titulo })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar tus cuentas vinculadas");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /EXP-123/ })).not.toBeInTheDocument();
  });
});

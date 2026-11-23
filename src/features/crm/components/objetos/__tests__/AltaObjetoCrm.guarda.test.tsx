import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NuevaEmpresaDialog } from "../NuevaEmpresaDialog";
import { NuevoContactoDialog } from "../NuevoContactoDialog";

const { crear, cargarPropiedades, refetch } = vi.hoisted(() => ({
  crear: vi.fn(),
  cargarPropiedades: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/features/crm/hooks/useObjetosCrm", () => ({
  useCrearEmpresaCrm: () => ({ mutate: crear, isPending: false }),
  useCrearContactoCrm: () => ({ mutate: crear, isPending: false }),
  useEmpresasCrm: () => ({ data: { filas: [], total: 0 } }),
}));
vi.mock("@/features/crm/hooks/usePropiedadesCrm", () => ({
  usePropiedadesCrm: cargarPropiedades,
}));
vi.mock("@/features/crm/hooks/useEmpresasSimilares", () => ({
  useEmpresasSimilares: () => ({ data: { filas: [] } }),
}));

const pais = { id: "pais-qa", clave: "pais", etiqueta: "País", tipo: "texto", archivada: false, opciones: [] };

beforeEach(() => {
  vi.clearAllMocks();
  cargarPropiedades.mockReturnValue({ isSuccess: true, data: [], refetch });
});

describe("Alta de objetos CRM", () => {
  it.each([
    { objeto: "empresa", Dialog: NuevaEmpresaDialog },
    { objeto: "contacto", Dialog: NuevoContactoDialog },
  ])("conserva la captura de $objeto si se cancela el descarte", async ({ Dialog }) => {
    function Pantalla() {
      const [open, setOpen] = useState(true);
      return <Dialog open={open} onOpenChange={setOpen} />;
    }
    render(<Pantalla />);

    const campo = screen.getByRole("textbox", { name: /nombre/i });
    fireEvent.change(campo, { target: { value: "Captura sintética" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("¿Descartar los cambios?");
    fireEvent.click(screen.getByRole("button", { name: "Seguir capturando" }));
    expect(campo).toHaveValue("Captura sintética");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(crear).not.toHaveBeenCalled();
  });

  it("espera los campos configurados, permite reintentar y respeta los obligatorios", async () => {
    cargarPropiedades.mockReturnValue({ isPending: true, refetch });
    const dialogo = () => <NuevaEmpresaDialog open onOpenChange={vi.fn()} />;
    const { rerender } = render(dialogo());
    fireEvent.change(screen.getByRole("textbox", { name: /nombre/i }), { target: { value: "Empresa sintética" } });
    const guardar = () => screen.getByRole("button", { name: "Guardar" });
    expect(screen.getByRole("status")).toHaveTextContent("Cargando campos de empresa");
    expect(guardar()).toBeDisabled();
    fireEvent.submit(screen.getByRole("textbox", { name: /nombre/i }).closest("form")!);
    expect(crear).not.toHaveBeenCalled();

    cargarPropiedades.mockReturnValue({ isError: true, refetch });
    rerender(dialogo());
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron cargar los campos de empresa");
    expect(guardar()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();

    cargarPropiedades.mockReturnValue({ isSuccess: true, data: [pais], refetch });
    rerender(dialogo());
    const requerido = screen.getByRole("textbox", { name: "País" });
    expect(guardar()).toBeDisabled();
    fireEvent.change(requerido, { target: { value: "México" } });
    fireEvent.blur(requerido);
    await waitFor(() => expect(guardar()).toBeEnabled());
    fireEvent.click(guardar());
    expect(crear).toHaveBeenCalledExactlyOnceWith(
      { nombre: "Empresa sintética", valores: [{ propiedadId: "pais-qa", tipo: "texto", valor: "México" }] },
      expect.any(Object),
    );
  });
});

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NuevoProveedorDialog from "../NuevoProveedorDialog";

vi.mock("@/features/proveedor/hooks", async () => {
  const { useNuevoProveedorController } = await import("../../hooks/useNuevoProveedorController");
  return { useNuevoProveedorController };
});
vi.mock("@/features/proveedor/services", () => ({
  findProveedorByRfcEnOrg: vi.fn().mockResolvedValue(null),
  ProveedorDuplicadoError: class extends Error {},
}));
vi.mock("@/hooks/shared", () => ({
  useOrgFilter: () => ({ organizationId: "org-sintetica" }),
}));
vi.mock("../../hooks/useNuevoProveedorController.csf", () => ({
  procesarCsfUpload: vi.fn(),
  mergeCsfPatch: (prev: unknown) => prev,
}));

describe("Nuevo proveedor", () => {
  it("pide confirmar Cancelar si hay captura y la conserva al seguir capturando", async () => {
    const guardar = vi.fn();
    const queryClient = new QueryClient();
    function Pantalla() {
      const [open, setOpen] = useState(true);
      return <NuevoProveedorDialog open={open} onOpenChange={setOpen} onSave={guardar} />;
    }
    render(<QueryClientProvider client={queryClient}><Pantalla /></QueryClientProvider>);

    const campo = screen.getByRole("textbox", { name: /nombre/i });
    fireEvent.change(campo, { target: { value: "Proveedor sintético" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("¿Descartar los cambios?");
    fireEvent.click(screen.getByRole("button", { name: "Seguir capturando" }));
    expect(campo).toHaveValue("PROVEEDOR SINTÉTICO");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(guardar).not.toHaveBeenCalled();
  });

  it("conserva los datos al fallar y no permite cerrar durante el alta", async () => {
    let rechazar!: (error: Error) => void;
    const pendiente = new Promise<void>((_resolve, reject) => { rechazar = reject; });
    const guardar = vi.fn(() => pendiente);
    const cerrar = vi.fn();
    render(<QueryClientProvider client={new QueryClient()}>
      <NuevoProveedorDialog open onOpenChange={cerrar} onSave={guardar}
        prefill={{ nombre: "Proveedor sintético", rfc: "XAXX010101000" }} />
    </QueryClientProvider>);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Origen" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Nacional" }));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Tipo" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Naviera" }));
    fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
    const clabe = screen.getByRole("textbox", { name: "CLABE interbancaria" });
    fireEvent.change(clabe, { target: { value: "000000000000000001" } });
    fireEvent.blur(clabe);
    expect(clabe).toHaveAccessibleDescription(/dígito verificador inválido/);
    fireEvent.click(screen.getByRole("button", { name: "Crear proveedor" }));
    expect(clabe).toHaveFocus();
    expect(guardar).not.toHaveBeenCalled();
    fireEvent.change(clabe, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear sin datos bancarios" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(cerrar).not.toHaveBeenCalled();
    await act(async () => rechazar(new Error("Guardado simulado")));
    expect(screen.getByRole("button", { name: "Crear sin datos bancarios" })).toBeEnabled();
    expect(guardar).toHaveBeenCalledOnce();
  });
});

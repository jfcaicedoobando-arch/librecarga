import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

const mutateAsync = vi.fn().mockResolvedValue({ version_anterior: 1, version_nueva: 2 });
vi.mock("@/features/cotizacion/hooks/useVersionadoCotizacion", () => ({
  useRecotizarCotizacion: () => ({ mutateAsync, isPending: false }),
}));

import { RecotizarModal } from "@/features/cotizacion/components/versionado/RecotizarModal";

function renderModal() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <RecotizarModal open onOpenChange={() => {}} cotizacionId="c1" versionActual={1} />
    </QueryClientProvider>,
  );
}

beforeEach(() => mutateAsync.mockClear());

describe("RecotizarModal", () => {
  it("deshabilita el botón sin motivo ni confirmación", () => {
    renderModal();
    const btn = screen.getByRole("button", { name: /confirmar re-cotización/i });
    expect(btn).toBeDisabled();
  });

  it("habilita cuando hay motivo y se tipea RECOTIZAR", async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(/motivo/i), {
      target: { value: "Cliente pidió cambio" },
    });
    fireEvent.change(screen.getByLabelText(/escribe/i), { target: { value: "RECOTIZAR" } });
    const btn = screen.getByRole("button", { name: /confirmar/i });
    expect(btn).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(mutateAsync).toHaveBeenCalledWith({
      cotizacionId: "c1",
      motivo: "Cliente pidió cambio",
    });
  });

  it("rechaza confirmación incorrecta", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: "motivo válido" } });
    fireEvent.change(screen.getByLabelText(/escribe/i), { target: { value: "recotizar" } });
    expect(screen.getByRole("button", { name: /confirmar/i })).toBeDisabled();
  });

  it.each(["Cancelar", "Cerrar", "Escape"])("limpia la captura tras cerrar con %s", (formaDeCerrar) => {
    function Controlado() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen(true)}>Reabrir</button>
          <RecotizarModal open={open} onOpenChange={setOpen} cotizacionId="c1" versionActual={1} />
        </>
      );
    }
    render(<Controlado />);
    fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: "Motivo válido" } });
    fireEvent.change(screen.getByLabelText(/escribe/i), { target: { value: "RECOTIZAR" } });
    expect(screen.getByRole("button", { name: /confirmar re-cotización/i })).toBeEnabled();

    if (formaDeCerrar === "Escape") fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    else fireEvent.click(screen.getByRole("button", { name: formaDeCerrar }));
    fireEvent.click(screen.getByRole("button", { name: "Reabrir" }));

    expect(screen.getByLabelText(/motivo/i)).toHaveValue("");
    expect(screen.getByLabelText(/escribe/i)).toHaveValue("");
    expect(screen.getByRole("button", { name: /confirmar re-cotización/i })).toBeDisabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("mantiene la captura si falla el intento", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("Error transitorio"));
    renderModal();
    fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: "Motivo válido" } });
    fireEvent.change(screen.getByLabelText(/escribe/i), { target: { value: "RECOTIZAR" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /confirmar re-cotización/i }));
    });
    expect(screen.getByLabelText(/motivo/i)).toHaveValue("Motivo válido");
    expect(screen.getByLabelText(/escribe/i)).toHaveValue("RECOTIZAR");
    expect(screen.getByRole("button", { name: /confirmar re-cotización/i })).toBeEnabled();
  });
});

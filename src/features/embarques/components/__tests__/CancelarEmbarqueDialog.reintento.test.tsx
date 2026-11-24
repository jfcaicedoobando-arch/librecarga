import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CancelarEmbarqueDialog } from "../header/CancelarEmbarqueDialog";

it("conserva el motivo tras un fallo y cierra tras el reintento exitoso", async () => {
  const onConfirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const onOpenChange = vi.fn();
  render(<CancelarEmbarqueDialog open expediente="EXP-01" isPending={false}
    onConfirm={onConfirm} onOpenChange={onOpenChange} />);
  const motivo = screen.getByRole("textbox", { name: /Motivo/ });
  fireEvent.change(motivo, { target: { value: "El cliente pospuso la carga." } });
  const confirmar = screen.getByRole("button", { name: "Cancelar embarque" });
  fireEvent.click(confirmar);
  expect(await screen.findByRole("alert")).toHaveTextContent("Vuelve a intentar");
  expect(motivo).toHaveValue("El cliente pospuso la carga.");
  expect(onOpenChange).not.toHaveBeenCalled();
  fireEvent.click(confirmar);
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false));
  expect(onConfirm.mock.calls).toEqual([["El cliente pospuso la carga."], ["El cliente pospuso la carga."]]);
});

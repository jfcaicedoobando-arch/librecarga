import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { RechazarDocumentoDialog } from "../tabDocumentos/RechazarDocumentoDialog";

it("conserva el motivo del rechazo tras un fallo y cierra sólo tras éxito", async () => {
  const onConfirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const onOpenChange = vi.fn();
  render(
    <MemoryRouter>
      <RechazarDocumentoDialog open onOpenChange={onOpenChange} documentoNombre="BL" pendiente={false} onConfirm={onConfirm} />
    </MemoryRouter>,
  );
  const motivo = screen.getByRole("textbox", { name: /Explica el motivo/ });
  fireEvent.change(motivo, { target: { value: "El documento no es legible" } });
  fireEvent.click(screen.getByRole("button", { name: "Rechazar documento" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Conservamos el motivo");
  expect(motivo).toHaveValue("El documento no es legible");
  expect(onOpenChange).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Rechazar documento" }));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false));
  expect(onConfirm.mock.calls).toEqual([["El documento no es legible"], ["El documento no es legible"]]);
});

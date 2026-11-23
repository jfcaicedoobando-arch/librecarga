import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { expect, it, vi } from "vitest";
import { useDirtyGuard } from "@/hooks/shared/useDirtyGuard";
import { TabTracking } from "../TabTracking";

const registrar = vi.hoisted(() => vi.fn());
vi.mock("@/features/embarques/hooks", () => ({
  useEventosEmbarque: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock("@/hooks/shared", () => ({ usePermissions: () => ({ canEdit: true }) }));
vi.mock("../tracking/TrackingNavieraActions", () => ({ TrackingNavieraActions: () => null }));
vi.mock("@/features/embarques/hooks/mutations/useRegistrarEventoTracking", () => ({
  useRegistrarEventoTracking: () => ({ registrar, isPending: false }),
}));

function TrackingConGuarda() {
  const [sucio, setSucio] = useState(false);
  const { guardDialog, confirmarSalida } = useDirtyGuard(sucio);
  return <>{guardDialog}<TabTracking embarqueId="e1" onDirtyChange={setSucio} confirmarDescarte={confirmarSalida} /></>;
}

it("anuncia el panel y permite conservar la ETA capturada al intentar ocultarlo", () => {
  render(<MemoryRouter><TrackingConGuarda /></MemoryRouter>);
  const abrir = screen.getByRole("button", { name: "Registrar Evento" });
  expect(abrir).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(abrir);
  const ocultar = screen.getByRole("button", { name: "Ocultar opciones de registro" });
  expect(ocultar).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("region", { name: "Opciones de registro de tracking" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: /^Actualizar ETA/ }));

  const fuente = screen.getByRole("textbox", { name: /Motivo o fuente/ });
  fireEvent.change(fuente, { target: { value: "Transportista confirmó la fecha" } });
  fireEvent.click(ocultar);
  expect(screen.getByRole("alertdialog")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Seguir capturando" }));
  expect(fuente).toHaveValue("Transportista confirmó la fecha");

  fireEvent.click(ocultar);
  fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));
  expect(screen.getByRole("button", { name: "Registrar Evento" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("textbox", { name: /Motivo o fuente/ })).toBeNull();
  expect(registrar).not.toHaveBeenCalled();
});

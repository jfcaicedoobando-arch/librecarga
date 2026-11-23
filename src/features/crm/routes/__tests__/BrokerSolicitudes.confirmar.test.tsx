import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BrokerSolicitudes from "../BrokerSolicitudes";

const mocks = vi.hoisted(() => ({ resolver: vi.fn() }));
vi.mock("../../hooks/useBrokerSolicitudes", () => ({
  useBrokerSolicitudes: () => ({
    data: [{
      id: "solicitud-demo", empresa: "Empresa de prueba", broker: "Broker de prueba",
      rol_contacto: "Operaciones", relacion: "Comercial", tiempo_cierre: "Dos meses", created_at: "2026-11-23",
    }],
    refetch: vi.fn(),
  }),
  useResolverSolicitudBroker: () => ({ mutateAsync: mocks.resolver, isPending: false }),
}));

describe("BrokerSolicitudes", () => {
  it("explica el alcance de la autorización y sólo resuelve tras confirmar", async () => {
    mocks.resolver.mockResolvedValue(undefined);
    render(<BrokerSolicitudes />);
    const autorizar = screen.getByRole("button", { name: "Autorizar" });
    fireEvent.click(autorizar);
    let dialogo = screen.getByRole("alertdialog", { name: "¿Autorizar solicitud?" });
    expect(dialogo).toHaveTextContent("Asignarás Empresa de prueba a Broker de prueba");
    expect(dialogo).toHaveTextContent("Las demás solicitudes pendientes");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(mocks.resolver).not.toHaveBeenCalled();
    fireEvent.click(autorizar);
    dialogo = screen.getByRole("alertdialog", { name: "¿Autorizar solicitud?" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Autorizar" }));
    expect(mocks.resolver).toHaveBeenCalledExactlyOnceWith({ id: "solicitud-demo", autorizar: true });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
});

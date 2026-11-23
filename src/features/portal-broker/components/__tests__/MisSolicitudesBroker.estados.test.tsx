import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MisSolicitudesBroker from "../MisSolicitudesBroker";

const { consulta } = vi.hoisted(() => ({ consulta: vi.fn() }));
vi.mock("../../hooks/useBrokerPortal", () => ({ useMisSolicitudesBroker: consulta }));

describe("Mis solicitudes del broker", () => {
  it("permite recuperar el seguimiento cuando falla la consulta inicial", () => {
    const refetch = vi.fn();
    consulta.mockReturnValue({ isError: true, isFetching: false, refetch });
    const { rerender } = render(<MisSolicitudesBroker />);

    expect(screen.getByRole("heading", { name: "Mis solicitudes" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar tus solicitudes");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledOnce();

    consulta.mockReturnValue({ isError: true, isFetching: true, refetch });
    rerender(<MisSolicitudesBroker />);
    expect(screen.getByRole("button", { name: "Reintentando…" })).toBeDisabled();

    consulta.mockReturnValue({
      data: [{ id: "empresa", empresa: "Empresa local", organizacion: "Organización local",
        created_at: "2026-11-01T12:00:00Z", estado: "autorizada" }],
      isError: false, isFetching: false, refetch,
    });
    rerender(<MisSolicitudesBroker />);
    expect(screen.getByText("Empresa local")).toBeVisible();
    expect(screen.getByText("Autorizada")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("mantiene visible el panel y distingue carga de una lista vacía", () => {
    consulta.mockReturnValue({ isLoading: true, isError: false });
    const { rerender } = render(<MisSolicitudesBroker />);
    expect(screen.getByRole("heading", { name: "Mis solicitudes" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando solicitudes…");
    expect(screen.queryByText("Todavía no has enviado solicitudes.")).not.toBeInTheDocument();

    consulta.mockReturnValue({ data: [], isLoading: false, isError: false });
    rerender(<MisSolicitudesBroker />);
    expect(screen.getByText("Todavía no has enviado solicitudes.")).toBeVisible();
  });
});

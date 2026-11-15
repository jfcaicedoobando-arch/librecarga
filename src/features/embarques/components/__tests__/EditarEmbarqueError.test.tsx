import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { EditarEmbarqueError } from "../EditarEmbarqueError";

describe("error de carga del editor de embarques", () => {
  it("permite reintentar sin perder protección de captura al cerrar o navegar", () => {
    const reintentar = vi.fn();
    render(<MemoryRouter>
      <a href="/embarques">Embarques</a>
      <EditarEmbarqueError isDirty description="No pudimos cargar los costos. Reintenta antes de guardar." onRetry={reintentar} />
    </MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("Reintenta antes de guardar");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reintentar).toHaveBeenCalledOnce();
    const cierre = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cierre);
    expect(cierre.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("link", { name: "Embarques" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("¿Salir sin guardar?");
    fireEvent.click(screen.getByRole("button", { name: "Seguir capturando" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("no bloquea cierre cuando no hay captura pendiente", () => {
    render(<MemoryRouter><EditarEmbarqueError isDirty={false} onRetry={vi.fn()} /></MemoryRouter>);
    const cierre = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cierre);
    expect(cierre.defaultPrevented).toBe(false);
  });
});

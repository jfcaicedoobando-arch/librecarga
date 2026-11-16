import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AvanzarEstadoButton } from "../header/AvanzarEstadoButton";

function renderCierre(cierreBloqueadoPorChecklist: boolean) {
  const avanzar = vi.fn();
  const irACierre = vi.fn();
  render(
    <AvanzarEstadoButton
      estadoVisual="Por liquidar"
      siguienteEstado="Cerrado"
      avanzandoEstado={false}
      bloqueadoPorDocs={false}
      docsFaltantes={[]}
      cierreBloqueadoPorChecklist={cierreBloqueadoPorChecklist}
      onIrACierre={irACierre}
      onAvanzarEstado={avanzar}
      onIrADocumentos={vi.fn()}
    />,
  );
  return { avanzar, irACierre };
}

describe("acción de cierre en el encabezado", () => {
  it("si hay pendientes, el botón abre el checklist sin pedir el cierre", () => {
    const { avanzar, irACierre } = renderCierre(true);
    fireEvent.click(screen.getByRole("button", { name: "Revisar pendientes de cierre" }));
    expect(irACierre).toHaveBeenCalledOnce();
    expect(avanzar).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("si puede cerrar, confirma antes de avanzar a Cerrado", () => {
    const { avanzar, irACierre } = renderCierre(false);
    fireEvent.click(screen.getByRole("button", { name: "Avanzar a Cerrado" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(avanzar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(avanzar).toHaveBeenCalledOnce();
    expect(irACierre).not.toHaveBeenCalled();
  });
});

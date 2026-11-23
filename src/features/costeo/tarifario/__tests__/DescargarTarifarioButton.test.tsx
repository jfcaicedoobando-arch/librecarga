import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DescargarTarifarioButton } from "../DescargarTarifarioButton";

describe("descarga de tarifario", () => {
  it("distingue carga, fallo y lista vacía y descarga sólo con filas", () => {
    const descargar = vi.fn();
    const vista = ({ cargando = false, error = false, hayFilas = false }) => (
      <DescargarTarifarioButton cargando={cargando} error={error} hayFilas={hayFilas} onDownload={descargar} />
    );
    const { rerender } = render(vista({ cargando: true }));
    const boton = screen.getByRole("button", { name: "Descargar CSV" });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAccessibleDescription("Espera a que termine la consulta.");
    fireEvent.click(boton);

    rerender(vista({ error: true, hayFilas: true }));
    expect(boton).toBeDisabled();
    expect(boton).toHaveAccessibleDescription("No se pudo cargar la lista para exportar.");
    fireEvent.click(boton);

    rerender(vista({}));
    expect(boton).toBeDisabled();
    expect(boton).toHaveAccessibleDescription("No hay filas visibles para exportar.");
    expect(descargar).not.toHaveBeenCalled();
    rerender(vista({ hayFilas: true }));
    expect(boton).toBeEnabled();
    fireEvent.click(boton);
    expect(descargar).toHaveBeenCalledOnce();
  });
});

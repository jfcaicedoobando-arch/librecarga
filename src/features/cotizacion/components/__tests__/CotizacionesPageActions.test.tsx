/**
 * P3 (v13.819.1) — Con cero resultados filtrados, "Exportar CSV" seguía
 * habilitado y generaba un archivo vacío.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { CotizacionesPageActions } from "../CotizacionesPageActions";

function montar(totalFiltrado: number, { actualizandoResultados = false, canEdit = true } = {}) {
  const onExportar = vi.fn();
  render(
    <MemoryRouter>
      <CotizacionesPageActions canEdit={canEdit} totalFiltrado={totalFiltrado} actualizandoResultados={actualizandoResultados}
        onExportar={onExportar} onNueva={vi.fn()} />
    </MemoryRouter>,
  );
  return { onExportar, boton: screen.getByRole("button", { name: /Exportar CSV/i }) };
}

describe("CotizacionesPageActions · Exportar CSV", () => {
  it("con cero resultados queda deshabilitado y explica la causa", () => {
    const { boton, onExportar } = montar(0);
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute("aria-describedby", "exportar-csv-motivo");
    expect(
      screen.getByText("No hay cotizaciones que exportar con los filtros actuales."),
    ).toBeInTheDocument();

    fireEvent.click(boton);
    expect(onExportar).not.toHaveBeenCalled();
  });

  it("con resultados exporta normalmente", () => {
    const { boton, onExportar } = montar(3);
    expect(boton).not.toBeDisabled();
    fireEvent.click(boton);
    expect(onExportar).toHaveBeenCalledTimes(1);
  });

  it("explica cuándo el conteo anterior todavía no corresponde al filtro nuevo", () => {
    const { boton, onExportar } = montar(3, { actualizandoResultados: true });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAccessibleDescription("Actualizando los resultados de los filtros.");
    fireEvent.click(boton);
    expect(onExportar).not.toHaveBeenCalled();
  });

  it("separa el CTA de escritorio del FAB móvil en el breakpoint md", () => {
    montar(3);
    expect(screen.getByRole("button", { name: "Nueva cotización" })).toHaveClass("hidden", "md:inline-flex");
  });
});

describe("CotizacionesPageActions · menú adaptable", () => {
  it.each([true, false])("con canEdit=%s respeta los permisos en ambos diseños", (canEdit) => {
    const { boton, onExportar } = montar(3, { canEdit });
    const menuTrigger = screen.getByRole("button", { name: "Más acciones" });
    expect(menuTrigger).toHaveClass("md:hidden");
    expect(boton).toHaveClass("hidden", "md:inline-flex");
    expect(screen.getByRole("link", { name: "Plantillas" })).toHaveClass("hidden", "md:inline-flex");
    const tarifarioEscritorio = screen.queryByRole("link", { name: "Nuevo tarifario" });
    if (canEdit) {
      expect(tarifarioEscritorio).toHaveClass("hidden", "md:inline-flex");
      expect(tarifarioEscritorio).toHaveAttribute("href", "/cotizaciones/nueva/tarifario");
    } else {
      expect(tarifarioEscritorio).toBeNull();
    }

    fireEvent.keyDown(menuTrigger, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Plantillas" })).toHaveAttribute("href", "/cotizaciones/plantillas");
    const tarifarioMovil = screen.queryByRole("menuitem", { name: "Nuevo tarifario" });
    if (canEdit) {
      expect(tarifarioMovil).toHaveAttribute("href", "/cotizaciones/nueva/tarifario");
    } else {
      expect(tarifarioMovil).toBeNull();
    }

    fireEvent.click(screen.getByRole("menuitem", { name: "Exportar CSV" }));
    expect(onExportar).toHaveBeenCalledTimes(1);
  });
});

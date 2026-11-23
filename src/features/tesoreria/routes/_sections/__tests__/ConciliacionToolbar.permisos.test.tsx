import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { createRef, type ComponentProps } from "react";
import { ConciliacionToolbar } from "@/features/tesoreria/routes/_sections/ConciliacionToolbar";

/**
 * Espejo UI de la política RLS de `bbva_movimientos`: sólo tesorería y los
 * administradores pueden capturar/importar movimientos. Antes la UI ofrecía la
 * acción a cualquier rol de finanzas (p.ej. contador) y la base respondía 42501.
 */
function renderToolbar(puedeCapturar: boolean, opciones?: Partial<ComponentProps<typeof ConciliacionToolbar>>) {
  return render(
    <ConciliacionToolbar
      cuentas={[{ id: "c1", banco: "BBVA", alias: "Principal", moneda: "MXN" }]}
      cuentaId="c1"
      onCuentaChange={vi.fn()}
      estado="Pendiente"
      onEstadoChange={vi.fn()}
      pendientesCount={2}
      isAutoConciliando={false}
      onConciliarExactos={vi.fn()}
      onAbrirManual={vi.fn()}
      fileRef={createRef<HTMLInputElement>()}
      onFile={vi.fn()}
      importando={false}
      puedeCapturar={puedeCapturar}
      {...opciones}
    />,
  );
}

describe("<ConciliacionToolbar /> permisos de captura", () => {
  it("distingue cuentas cargando, error y lista vacía con nombres accesibles", () => {
    const reintentar = vi.fn();
    const carga = renderToolbar(true, { cuentas: [], cuentaId: "", cuentasLoading: true });
    expect(screen.getByRole("combobox", { name: "Cuenta bancaria" })).toHaveTextContent("Cargando cuentas…");
    expect(screen.queryByText("No hay cuentas activas")).not.toBeInTheDocument();
    carga.unmount();

    const error = renderToolbar(true, { cuentas: [], cuentaId: "", cuentasError: true, onRetryCuentas: reintentar });
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron consultar las cuentas bancarias.");
    expect(screen.getByRole("combobox", { name: "Estado de conciliación" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reintentar).toHaveBeenCalledOnce();
    error.unmount();

    renderToolbar(true, { cuentas: [], cuentaId: "" });
    expect(screen.getByText("No hay cuentas activas")).toBeInTheDocument();
  });

  it("muestra movimiento manual e importar cuando el rol puede capturar", () => {
    renderToolbar(true);
    expect(screen.getByRole("button", { name: /movimiento manual/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /importar/i })).toBeInTheDocument();
  });

  it("oculta las acciones de escritura y explica por qué cuando el rol es de lectura", () => {
    renderToolbar(false);
    expect(screen.queryByRole("button", { name: /movimiento manual/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /importar/i })).not.toBeInTheDocument();
    expect(screen.getByText(/sólo tesorería puede capturar/i)).toBeInTheDocument();
  });
});

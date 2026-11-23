import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PasarEmpresaAProspectoBoton } from "@/features/crm/components/objetos/PasarEmpresaAProspectoBoton";
import type { SolicitudPricingRow } from "@/features/crm/services/pricing/tiposPricing";
import { AccionesSolicitudPricing } from "../AccionesSolicitudPricing";
import { AjustePlazoPricing } from "../AjustePlazoPricing";
import { PricingOportunidadTab } from "../PricingOportunidadTab";
import { SelectorAdjuntos } from "../SelectorAdjuntos";

const mocks = vi.hoisted(() => ({
  accion: vi.fn(), pasar: vi.fn(), permiso: vi.fn(), ajustarPlazo: vi.fn(), solicitudes: [] as SolicitudPricingRow[],
}));
vi.mock("@/features/crm/hooks/usePricingCrm", () => ({
  useAccionSolicitud: () => ({ mutate: mocks.accion, isPending: false }),
  useGuardarSolicitud: () => ({ mutate: vi.fn(), isPending: false }),
  useSolicitudesOportunidad: () => ({ data: mocks.solicitudes }),
}));
vi.mock("@/features/crm/hooks/usePlazoPricing", () => ({
  usePlazoPricing: () => ({ mutate: mocks.ajustarPlazo, isPending: false }),
}));
vi.mock("../SolicitudPricingDetalle", () => ({ SolicitudPricingDetalle: () => null }));
vi.mock("../SolicitudPricingDialog", () => ({ SolicitudPricingDialog: () => null }));
vi.mock("@/features/crm/hooks/useObjetosCrm", () => ({
  usePasarAProspecto: () => ({ mutate: mocks.pasar, isPending: false }),
}));
vi.mock("@/features/crm/hooks/usePermisoPasarAProspecto", () => ({
  usePermisoPasarAProspecto: () => mocks.permiso(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permiso.mockReturnValue({ estado: "permitido" });
});

describe("Guardas comerciales", () => {
  it("conserva la solicitud al cerrar y cancela solo después de confirmar su folio", () => {
    const solicitud = {
      id: "solicitud-1", folio: "PRI-01", oportunidad_id: "o-1", estado: "enviada",
    } as SolicitudPricingRow;
    render(<AccionesSolicitudPricing solicitud={solicitud} puedeCancelar puedeResponder={false}
      puedeEditar={false} puedeCopiar={false} onEditar={vi.fn()} numOpciones={0} />);

    const abrir = () => fireEvent.click(screen.getByRole("button", { name: "Cancelar solicitud" }));
    abrir();
    const dialogo = screen.getByRole("alertdialog", { name: /PRI-01/ });
    expect(mocks.accion).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Conservar solicitud" }));
    expect(mocks.accion).not.toHaveBeenCalled();

    abrir();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancelar solicitud" }));
    expect(mocks.accion).toHaveBeenCalledExactlyOnceWith(
      { id: "solicitud-1", oportunidadId: "o-1", accion: "cancelar" },
      { onSuccess: expect.any(Function) },
    );
  });

  it("identifica la empresa y recupera el permiso al confirmar", () => {
    const empresa = {
      id: "empresa-1", nombre: "Empresa de ensayo", organization_id: "org-1",
      created_by: "user-1", deleted_at: null, lead_origen_id: null, cliente_id: null,
    };
    const vista = render(<PasarEmpresaAProspectoBoton empresa={empresa} />);
    fireEvent.click(screen.getByRole("button", { name: "Pasar a prospecto" }));
    const dialogo = screen.getByRole("alertdialog", { name: /Empresa de ensayo/ });
    expect(mocks.pasar).not.toHaveBeenCalled();
    mocks.permiso.mockReturnValue({ estado: "denegado", motivo: "Sin permiso vigente" });
    vista.rerender(<PasarEmpresaAProspectoBoton empresa={empresa} />);
    expect(within(dialogo).getByRole("button", { name: "Pasar a prospecto" })).toBeDisabled();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Conservar empresa" }));
    expect(mocks.pasar).not.toHaveBeenCalled();

    mocks.permiso.mockReturnValue({ estado: "permitido" });
    vista.rerender(<PasarEmpresaAProspectoBoton empresa={empresa} />);
    fireEvent.click(screen.getByRole("button", { name: "Pasar a prospecto" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Pasar a prospecto" }));
    expect(mocks.pasar).toHaveBeenCalledExactlyOnceWith("empresa-1", { onSuccess: expect.any(Function) });
  });

  it("ignora las capturas pegadas durante una subida y vuelve a aceptar archivos", () => {
    const onArchivos = vi.fn();
    const vista = render(<SelectorAdjuntos onArchivos={onArchivos} disabled />);
    const archivo = new File(["prueba"], "captura.png", { type: "image/png" });
    const pegar = () => fireEvent.paste(screen.getByRole("status"), { clipboardData: { files: [archivo] } });
    expect(screen.getByRole("status")).toHaveTextContent("Espera a que termine la subida.");
    pegar();
    expect(onArchivos).not.toHaveBeenCalled();
    vista.rerender(<SelectorAdjuntos onArchivos={onArchivos} />);
    pegar();
    expect(onArchivos).toHaveBeenCalledExactlyOnceWith([archivo]);
  });

  it("valida que la ampliación del plazo use horas enteras antes de enviar", () => {
    const solicitud = {
      id: "solicitud-1", oportunidad_id: "o-1", estado: "enviada", complejidad: "alta",
      enviada_at: new Date().toISOString(),
    } as SolicitudPricingRow;
    render(<AjustePlazoPricing solicitud={solicitud} />);
    const horas = screen.getByRole("spinbutton", { name: "Nuevo plazo (horas)" });
    fireEvent.change(screen.getByRole("textbox", { name: /Justificación/ }), { target: { value: "Justificación de prueba" } });
    fireEvent.change(horas, { target: { value: "49.5" } });
    const ampliar = screen.getByRole("button", { name: "Ampliar plazo" });
    expect(ampliar).toBeDisabled();
    expect(horas).toHaveAccessibleDescription("Escribe un número entero entre 49 y 720 horas.");
    expect(mocks.ajustarPlazo).not.toHaveBeenCalled();
    fireEvent.change(horas, { target: { value: "50" } });
    fireEvent.click(ampliar);
    expect(mocks.ajustarPlazo).toHaveBeenCalledExactlyOnceWith(
      { id: "solicitud-1", oportunidadId: "o-1", tipo: "plazo", horas: 50, motivo: "Justificación de prueba" },
      { onSuccess: expect.any(Function) },
    );
  });

  it("enlaza el detalle de Pricing y devuelve el foco a su fila al cerrar", () => {
    mocks.solicitudes = [{ id: "solicitud-1", folio: "PRI-01", estado: "cancelada" } as SolicitudPricingRow];
    render(<PricingOportunidadTab oportunidadId="o-1" canEdit={false} />);
    const fila = screen.getByRole("button", { name: /PRI-01/ });
    fireEvent.click(fila);
    const detalle = screen.getByRole("region", { name: "Solicitud PRI-01" });
    expect(fila).toHaveAttribute("aria-expanded", "true");
    expect(fila).toHaveAttribute("aria-controls", detalle.id);
    expect(within(detalle).getByRole("heading")).toHaveFocus();
    fireEvent.click(within(detalle).getByRole("button", { name: "Cerrar detalle" }));
    expect(detalle).not.toBeInTheDocument();
    expect(fila).toHaveFocus();
  });
});

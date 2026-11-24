import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SolicitudPricingCampos, type DatosSolicitud } from "../SolicitudPricingCampos";

vi.mock("@/features/crm/hooks/usePricingCrm", () => ({ useUsuariosOrgCrm: () => ({ data: [] }) }));
vi.mock("@/features/catalogos/hooks", () => ({
  usePuertos: () => ({ data: [] }),
  useTiposContenedor: () => ({ data: [] }),
}));
vi.mock("@/features/crm/hooks/useBuscarAeropuertos", () => ({
  useBuscarAeropuertos: () => ({ data: [], isFetching: false, isError: false }),
}));

function Formulario({ unidad, inicial }: { unidad?: string | null; inicial?: Partial<DatosSolicitud> }) {
  const [datos, setDatos] = useState<DatosSolicitud>({ solicitante_id: "u1", peso: "100", dimensiones: "10x20x30", unidad_medida: unidad, ...inicial });
  return <>
    <SolicitudPricingCampos datos={datos} set={(campo, valor) => setDatos((prev) => ({ ...prev, [campo]: valor }))} />
    <output aria-label="Dimensiones capturadas">{datos.dimensiones}</output>
  </>;
}

describe("unidad de medida de Pricing", () => {
  it("es opcional y se ubica entre peso y dimensiones", () => {
    render(<Formulario />);
    const peso = screen.getByLabelText("Weight");
    const unidad = screen.getByLabelText("Units of measurement");
    const dimensiones = screen.getByLabelText("Dimensions");
    expect(unidad).toHaveTextContent("—");
    expect(peso.compareDocumentPosition(unidad) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(unidad.compareDocumentPosition(dimensiones) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("recupera una unidad guardada al editar sin cambiar peso ni dimensiones", () => {
    render(<Formulario unidad="lb" />);
    expect(screen.getByLabelText("Units of measurement")).toHaveTextContent("Libras (lb)");
    expect(screen.getByLabelText("Weight")).toHaveValue("100");
    expect(screen.getByLabelText("Dimensions")).toHaveValue("10x20x30");
  });

  it("permite seleccionar una unidad y quitarla", async () => {
    render(<Formulario />);
    fireEvent.click(screen.getByLabelText("Units of measurement"));
    fireEvent.click(await screen.findByRole("option", { name: "Kilogramos (kg)" }));
    expect(screen.getByLabelText("Units of measurement")).toHaveTextContent("Kilogramos (kg)");
    fireEvent.click(screen.getByLabelText("Units of measurement"));
    fireEvent.click(await screen.findByRole("option", { name: "—" }));
    expect(screen.getByLabelText("Units of measurement")).toHaveTextContent("—");
  });
});

describe("medidas de una solicitud aérea", () => {
  const inicial = {
    servicio: "Aéreo",
    cantidad: 3,
    dimensiones: "1 bulto(s) de 100×100×100 cm; 2 bulto(s) de 100×100×100 cm",
    volumen_cbm: 3,
  };

  it("retira el volumen y las dimensiones derivadas al borrar una medida", () => {
    render(<Formulario inicial={inicial} unidad="kg" />);
    expect(screen.queryByLabelText("Quantity")).not.toBeInTheDocument();
    expect(screen.getAllByRole("spinbutton", { name: "Bultos" })).toHaveLength(2);
    const volumen = screen.getByRole("spinbutton", { name: "Volumen total (CBM)" });
    expect(volumen).toHaveValue(3);
    fireEvent.change(screen.getAllByRole("spinbutton", { name: "Ancho (cm)" })[0], { target: { value: "" } });
    expect(volumen).toHaveValue(null);
    expect(screen.getByLabelText("Dimensiones capturadas")).toBeEmptyDOMElement();
  });

  it("conserva un CBM manual mientras se corrige una medida", () => {
    render(<Formulario inicial={inicial} unidad="kg" />);
    const volumen = screen.getByRole("spinbutton", { name: "Volumen total (CBM)" });
    fireEvent.change(volumen, { target: { value: "4.5" } });
    fireEvent.change(screen.getAllByRole("spinbutton", { name: "Ancho (cm)" })[0], { target: { value: "" } });
    expect(volumen).toHaveValue(4.5);
    expect(screen.getByLabelText("Dimensiones capturadas")).toBeEmptyDOMElement();
  });
});

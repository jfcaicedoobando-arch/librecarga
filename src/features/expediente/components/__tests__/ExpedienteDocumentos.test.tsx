import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { calcularExpedienteDesde, type DocumentoExpediente } from "../../domain/expediente";
import { ExpedienteResumenCard } from "../ExpedienteResumenCard";
import { SubirDocumentoDialog } from "../SubirDocumentoDialog";

const TIPOS = ["Identificación", "Carta bancaria", "Opinión de cumplimiento", "Constancia"];
const base: DocumentoExpediente = {
  id: "archivo", tipo: "Carta bancaria", nombre: "carta.pdf", archivo: "carta.pdf",
  mime_type: "application/pdf", tamano_bytes: 123, fecha_documento: null,
  fecha_vencimiento: "2026-10-01", notas: null, created_at: "2026-09-01",
};
const resumen = calcularExpedienteDesde([
  base,
  { ...base, id: "opinion", tipo: "Opinión de cumplimiento", fecha_vencimiento: "2026-11-25" },
  { ...base, id: "constancia", tipo: "Constancia", fecha_vencimiento: "2027-01-01" },
], TIPOS, "2026-11-20");

function FormularioRenovar() {
  const [tipo, setTipo] = useState<string>();
  const [open, setOpen] = useState(false);
  return <>
    <ExpedienteResumenCard titulo="Documentos" resumen={resumen}
      onAgregar={(sugerido) => { setTipo(sugerido); setOpen(true); }} />
    <SubirDocumentoDialog open={open} onOpenChange={setOpen} tipoSugerido={tipo}
      tipos={TIPOS} tiposConVencimiento={[]} descripcion="Expediente" isPending={false} onGuardar={vi.fn()} />
  </>;
}

describe("Expediente", () => {
  it("ofrece renovar vencidos o por vencer y abre el formulario con el tipo correspondiente", () => {
    render(<FormularioRenovar />);
    expect(screen.getByRole("button", { name: "Agregar Identificación" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Renovar Opinión de cumplimiento" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Renovar Constancia" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Renovar Carta bancaria" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Tipo de documento" })).toHaveTextContent("Carta bancaria");
  });

  it("el expediente sin permisos de edición no ofrece agregar o renovar", () => {
    render(<ExpedienteResumenCard titulo="Documentos" resumen={resumen} />);
    expect(screen.queryByRole("button", { name: /Renovar|Agregar/ })).not.toBeInTheDocument();
  });

  it("rechaza inmediatamente el archivo sobredimensionado y guarda el reemplazo de 15 MB exactos", () => {
    const onGuardar = vi.fn();
    function archivo(tamano: number) {
      const file = new File(["PDF simulado"], "doc.pdf", { type: "application/pdf" });
      Object.defineProperty(file, "size", { value: tamano });
      return file;
    }
    const limite = 15 * 1024 * 1024;
    render(<SubirDocumentoDialog open onOpenChange={vi.fn()} tipos={TIPOS} tiposConVencimiento={[]}
      descripcion="Expediente" isPending={false} onGuardar={onGuardar} />);

    const input = screen.getByLabelText("Archivo");
    const guardar = screen.getByRole("button", { name: "Guardar documento" });
    fireEvent.change(input, { target: { files: [archivo(limite + 1)] } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(/supera los 15 MB/);
    expect(screen.getByRole("alert")).toHaveTextContent("El archivo supera los 15 MB permitidos");
    fireEvent.click(guardar);
    expect(onGuardar).not.toHaveBeenCalled();

    const valido = archivo(limite);
    fireEvent.change(input, { target: { files: [valido] } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "false");
    fireEvent.click(guardar);
    expect(onGuardar).toHaveBeenCalledWith(expect.objectContaining({ archivo: valido }));
  });
});

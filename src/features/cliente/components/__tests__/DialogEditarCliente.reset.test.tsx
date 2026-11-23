/**
 * v13.624.1 — El formulario de "Editar Cliente" sólo debe reiniciarse al abrir
 * el modal. Si llega un refetch del cliente con el modal abierto, lo editado
 * NO se debe perder (antes provocaba el "parpadeo" de los interruptores).
 */
import { act, render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import DialogEditarCliente from "../DialogEditarCliente";

vi.mock("@/hooks/shared", () => ({
  usePermissions: () => ({ canConfigurarAutorizacionCliente: true }),
}));
const { parseCsf } = vi.hoisted(() => ({ parseCsf: vi.fn() }));
vi.mock("@/features/cliente/services/csf", () => ({ parseCsf }));

const base = {
  nombre: "ACME",
  rfc: "AAA010101AAA",
  direccion: "",
  ciudad: "",
  estado: "",
  cp: "",
  contacto: "",
  email: "",
  telefono: "",
  regimen_fiscal: "601",
  uso_cfdi_default: "G03",
  dias_credito: 30,
  limite_credito_mxn: null,
  sin_comision: false,
  tipo_cliente: "general" as const,
  requiere_autorizacion_cotizacion: false,
  requiere_autorizacion_proforma: false,
};

describe("DialogEditarCliente | reinicio del formulario", () => {
  it("01 — conserva los valores cuando llega un refetch con el modal abierto", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <DialogEditarCliente
        open
        onOpenChange={() => {}}
        cliente={base}
        onSave={onSave}
        isSaving={false}
      />,
    );

    // Simula un refetch: nuevo objeto con los flags anteriores (encendidos).
    rerender(
      <DialogEditarCliente
        open
        onOpenChange={() => {}}
        cliente={{
          ...base,
          requiere_autorizacion_cotizacion: true,
          requiere_autorizacion_proforma: true,
        }}
        onSave={onSave}
        isSaving={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Guardar cambios/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        requiere_autorizacion_cotizacion: false,
        requiere_autorizacion_proforma: false,
      }),
    );
  });
});

describe("DialogEditarCliente | datos fiscales", () => {
  it("protege una edición y permite seguir capturando", () => {
    const cerrar = vi.fn();
    render(<DialogEditarCliente open onOpenChange={cerrar} cliente={base} onSave={vi.fn()} isSaving={false} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Nombre \/ Razón Social/ }), { target: { value: "Borrador" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("alertdialog", { name: /Descartar los cambios/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Seguir capturando" }));
    expect(screen.getByRole("textbox", { name: /Nombre \/ Razón Social/ })).toHaveValue("BORRADOR");
    expect(cerrar).not.toHaveBeenCalled();
  });

  it("espera la CSF y descarta respuestas que llegan después de cerrar", async () => {
    let resolverCsf!: (value: { nombre: string }) => void;
    const respuesta = new Promise((resolve) => { resolverCsf = resolve; });
    parseCsf.mockReturnValueOnce(respuesta);
    const props = { cliente: base, onOpenChange: vi.fn(), isSaving: false, onSave: vi.fn() };
    const { rerender } = render(<DialogEditarCliente {...props} open />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [new File(["PDF"], "constancia.pdf", { type: "application/pdf" })] } });
    expect(screen.getByRole("button", { name: "Leyendo constancia…" })).toBeDisabled();
    rerender(<DialogEditarCliente {...props} open={false} />);
    rerender(<DialogEditarCliente {...props} cliente={{ ...base, nombre: "Otro cliente" }} open />);
    await act(async () => resolverCsf({ nombre: "Respuesta atrasada" }));
    expect(screen.getByRole("textbox", { name: /Nombre \/ Razón Social/ })).toHaveValue("Otro cliente");
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("anuncia Régimen Fiscal SAT y Uso CFDI por nombre y conserva la etiqueta al elegir un valor", async () => {
    render(<DialogEditarCliente open onOpenChange={vi.fn()} cliente={base} onSave={vi.fn()} isSaving={false} />);

    const regimen = screen.getByRole("combobox", { name: "Régimen Fiscal SAT" });
    const usoCfdi = screen.getByRole("combobox", { name: "Uso CFDI por defecto" });
    expect(regimen).toHaveAttribute("aria-required", "true");
    expect(usoCfdi).not.toHaveAttribute("aria-required", "true");

    fireEvent.keyDown(regimen, { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("option", { name: /^626/ }), { key: "Enter" });

    expect(screen.getByRole("combobox", { name: "Régimen Fiscal SAT" })).toHaveTextContent("626");
    expect(screen.getByRole("combobox", { name: "Uso CFDI por defecto" })).toHaveTextContent("G03");
  });
});

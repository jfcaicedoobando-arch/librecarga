import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { DEFAULT_EMBARQUE_VALUES } from "@/features/embarques/domain/mappers/embarqueFromDb";
import type { EmbarqueValidationErrors } from "@/features/embarques/types/embarque";
import { BloqueClienteContactos } from "../secciones/BloqueClienteContactos";

function FormularioContactos({ esBorrador, errors = {} }: {
  esBorrador: boolean;
  errors?: EmbarqueValidationErrors;
}) {
  const form = useForm({ defaultValues: { ...DEFAULT_EMBARQUE_VALUES, clienteId: "cliente-prueba" } });
  return (
    <FormProvider {...form}>
      <BloqueClienteContactos
        clientes={[{ id: "cliente-prueba", nombre: "Cliente de prueba" }]}
        clienteNombre="Cliente de prueba" contactos={[]} errors={errors} esBorrador={esBorrador}
      />
    </FormProvider>
  );
}

describe("Requisito de contactos del embarque", () => {
  it("el borrador muestra los campos sin asterisco y explica cuándo se requieren", () => {
    render(<FormularioContactos esBorrador />);
    const requisito = /obligatorios para confirmar.*puedes guardar el borrador sin estos datos/i;
    expect(screen.getByRole("combobox", { name: "Shipper (Exportador)" })).toHaveAccessibleDescription(requisito);
    expect(screen.getByRole("combobox", { name: "Consignatario" })).toHaveAccessibleDescription(requisito);
  });

  it("en edición operativa conserva los asteriscos y omite la indicación de borrador", () => {
    render(<FormularioContactos esBorrador={false} />);
    const requisito = "Exportador y consignatario son obligatorios para confirmar el embarque.";
    expect(screen.getByRole("combobox", { name: "Shipper (Exportador) *" })).toHaveAccessibleDescription(requisito);
    expect(screen.getByRole("combobox", { name: "Consignatario *" })).toHaveAccessibleDescription(requisito);
  });

  it("nombra los controles por su etiqueta y vincula el error aunque el campo tenga valor", () => {
    render(<FormularioContactos esBorrador={false} errors={{
      modo: "Revisa el modo", tipo: "Revisa el tipo", clienteId: "Revisa el cliente", incoterm: "Revisa el Incoterm",
    }} />);
    const esperado = [
      ["Modo de Transporte *", "Revisa el modo"],
      ["Tipo de Operación *", "Revisa el tipo"],
      ["Cliente *", "Revisa el cliente"],
      ["Incoterm *", "Revisa el Incoterm"],
    ];
    for (const [name, error] of esperado) {
      const control = screen.getByRole("combobox", { name });
      expect(control).toHaveAttribute("aria-invalid", "true");
      expect(control).toHaveAccessibleDescription(error);
    }
    expect(screen.getByRole("combobox", { name: "Cliente *" })).toHaveTextContent("Cliente de prueba");
  });
});

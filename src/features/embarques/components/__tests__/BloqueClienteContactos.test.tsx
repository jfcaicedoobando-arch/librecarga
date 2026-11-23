import { render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { DEFAULT_EMBARQUE_VALUES } from "@/features/embarques/domain/mappers/embarqueFromDb";
import { BloqueClienteContactos } from "../secciones/BloqueClienteContactos";

function FormularioContactos({ esBorrador }: { esBorrador: boolean }) {
  const form = useForm({ defaultValues: DEFAULT_EMBARQUE_VALUES });
  return (
    <FormProvider {...form}>
      <BloqueClienteContactos clientes={[]} clienteNombre="" contactos={[]} errors={{}} esBorrador={esBorrador} />
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
});

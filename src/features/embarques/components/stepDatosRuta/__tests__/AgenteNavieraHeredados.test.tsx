import { act, fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { validateStepRuta } from "@/features/embarques/domain/embarqueWizardRuta";
import type { EmbarqueFormValues } from "@/features/embarques/hooks";
import { StepDatosRutaMaritimo } from "../StepDatosRutaMaritimo";

vi.mock("@/features/catalogos/components/PortSelect", () => ({ default: () => null }));
vi.mock("@/features/catalogos/hooks/useNavieras", () => ({
  useNavieras: () => ({ data: [{ id: "nav-1", name: "Naviera de la cotización" }, { id: "nav-2", name: "Naviera alterna" }] }),
}));
vi.mock("@/features/costeo/hooks/useCosteoAgentes", () => ({
  useCosteoAgentes: () => ({ data: [
    { id: "ag-1", nombre: "Agente de la cotización", activo: true },
    { id: "ag-2", nombre: "Agente alterno", activo: true },
  ] }),
}));

const errorNaviera = validateStepRuta({ modo: "Marítimo", tipoServicio: "LCL" }).naviera;

function RutaMaritima({ heredados = false }: { heredados?: boolean }) {
  const form = useForm<EmbarqueFormValues>({
    defaultValues: {
      tipoServicio: "LCL", navieraId: heredados ? "nav-2" : null, naviera: heredados ? "Naviera alterna" : "",
      agenteId: heredados ? "ag-2" : null, agente: heredados ? "Agente alterno" : "",
    },
  });
  const [navieraId, naviera, agenteId, agente] = form.watch(["navieraId", "naviera", "agenteId", "agente"]);
  return (
    <FormProvider {...form}>
      <StepDatosRutaMaritimo
        errors={heredados ? {} : { naviera: errorNaviera }}
        cotizacionNavieraId={heredados ? "nav-1" : undefined}
        cotizacionAgenteId={heredados ? "ag-1" : undefined}
      />
      <output aria-label="Valores de ruta">{[navieraId, naviera, agenteId, agente].join("/")}</output>
    </FormProvider>
  );
}

describe("Agente y Naviera marítimos", () => {
  it("asocia etiquetas y el error de la naviera obligatoria, y lo retira al seleccionar", () => {
    render(<RutaMaritima />);
    const naviera = screen.getByRole("combobox", { name: /^Naviera/ });
    const agente = screen.getByRole("combobox", { name: "Agente" });
    expect(screen.getByLabelText(/^Naviera/)).toBe(naviera);
    expect(screen.getByLabelText("Agente")).toBe(agente);
    expect(naviera).toHaveAttribute("aria-required", "true");
    expect(agente).not.toHaveAttribute("aria-required", "true");
    expect(naviera).toHaveAttribute("aria-invalid", "true");
    expect(naviera).toHaveAccessibleDescription(errorNaviera);
    expect(screen.getByRole("alert")).toHaveTextContent(errorNaviera);

    fireEvent.keyDown(naviera, { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "Naviera alterna" }));
    expect(naviera).toHaveTextContent("Naviera alterna");
    expect(naviera).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Valores de ruta")).toHaveTextContent("nav-2/Naviera alterna//");
  });

  it("distingue las acciones de restaurar y conserva el foco en su selector", async () => {
    render(<RutaMaritima heredados />);
    const naviera = screen.getByRole("combobox", { name: /^Naviera/ });
    const agente = screen.getByRole("combobox", { name: "Agente" });
    const valores = screen.getByLabelText("Valores de ruta");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Restaurar agente" })); });
    expect(naviera).toHaveTextContent("Naviera alterna");
    expect(agente).toHaveAccessibleDescription("Cotización");
    expect(agente).toHaveFocus();
    expect(valores).toHaveTextContent("nav-2/Naviera alterna/ag-1/Agente de la cotización");

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Restaurar naviera" })); });
    expect(naviera).toHaveAccessibleDescription("Cotización");
    expect(naviera).toHaveFocus();
    expect(valores).toHaveTextContent("nav-1/Naviera de la cotización/ag-1/Agente de la cotización");
    expect(screen.queryByRole("button", { name: /^Restaurar/ })).not.toBeInTheDocument();
  });
});

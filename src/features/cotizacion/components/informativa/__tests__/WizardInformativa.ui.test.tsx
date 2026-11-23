import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import WizardInformativa from "../WizardInformativa";

vi.mock("@/lib/contexts/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/shared", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/features/cliente/hooks", () => ({ useClientesForSelect: () => ({ data: [] }) }));
vi.mock("@/features/cotizacion/hooks", () => ({
  useCreateCotizacionInformativa: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn() }));

function abrir() {
  render(
    <MemoryRouter initialEntries={["/cotizaciones/nueva-informativa"]}>
      <Routes>
        <Route path="/cotizaciones/nueva-informativa" element={<WizardInformativa />} />
        <Route path="/cotizaciones" element={<h1>Cotizaciones</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Cotización informativa", () => {
  it("sale sin confirmación cuando no hubo cambios", () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("heading", { name: "Cotizaciones" })).toBeInTheDocument();
  });

  it("permite seguir capturando o descartar un borrador", () => {
    abrir();
    const notas = screen.getByPlaceholderText(/Condiciones generales/);
    fireEvent.change(notas, { target: { value: "Nota de prueba" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Seguir capturando" }));
    expect(notas).toHaveValue("Nota de prueba");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));
    expect(screen.getByRole("heading", { name: "Cotizaciones" })).toBeInTheDocument();
  });

  it("distingue los campos y anuncia el primer error de la tarifa", () => {
    abrir();
    expect(screen.getByRole("combobox", { name: /Cliente/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Vigencia desde/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Vigencia hasta/)).toBeInTheDocument();
    const tarifa = screen.getByRole("group", { name: "Tarifa 1" });
    fireEvent.click(screen.getByRole("button", { name: "Guardar tarifario" }));
    expect(within(tarifa).getByRole("textbox", { name: "Origen de la tarifa 1" })).toHaveFocus();
    expect(within(tarifa).getByText("Tarifa 1: origen requerido.")).toBeVisible();
  });
});

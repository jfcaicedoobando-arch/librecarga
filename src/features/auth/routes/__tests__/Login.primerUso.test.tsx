import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import Login from "../Login";

vi.mock("@/features/auth/services", () => ({
  requestPasswordReset: vi.fn(),
  resolveLandingRoute: vi.fn(),
  signInWithEmail: vi.fn(),
  signUpWithEmail: vi.fn(),
}));

function Destino() {
  const { state } = useLocation();
  return <output aria-label="Destino posterior">{state?.from?.pathname ?? "sin destino"}</output>;
}

describe("Acceso de primer uso", () => {
  it("orienta a la persona invitada sin ofrecer una agencia nueva desde el portal", () => {
    render(<MemoryRouter initialEntries={["/login?audiencia=cliente&tab=signup"]}><Login /></MemoryRouter>);
    expect(screen.getByText("Portal de clientes")).toBeVisible();
    expect(screen.getByText(/Abre el enlace recibido/)).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Crear agencia" })).toBeNull();
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
  });

  it("conserva el destino al cambiar a registro y regresar a acceso", () => {
    render(<MemoryRouter initialEntries={[{ pathname: "/login", state: { from: { pathname: "/cotizaciones" } } }]}>
      <Login /><Destino />
    </MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Crear agencia" }), { button: 0 });
    expect(screen.getByRole("textbox", { name: "Nombre completo" })).toBeVisible();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Iniciar sesión" }), { button: 0 });
    expect(screen.getByLabelText("Destino posterior")).toHaveTextContent("/cotizaciones");
  });

  it("abre el formulario desde el enlace de recuperación sin enviar correo", () => {
    render(<MemoryRouter initialEntries={["/login?recuperar=1"]}><Login /></MemoryRouter>);
    expect(screen.getByRole("dialog", { name: "Recuperar contraseña" })).toBeVisible();
  });
});

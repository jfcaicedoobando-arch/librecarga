import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalInviteDialog from "../PortalInviteDialog";

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("@/features/cliente/hooks", () => ({
  useInviteClientUser: () => ({ mutate: mocks.mutate, isPending: false }),
}));

function abrirDialogo() {
  render(<PortalInviteDialog open clienteId="cliente-demo" organizationId="org-demo" onOpenChange={vi.fn()} />);
  return {
    email: screen.getByRole<HTMLInputElement>("textbox", { name: "Email del cliente" }),
    enviar: screen.getByRole<HTMLButtonElement>("button", { name: "Enviar Invitación" }),
  };
}

describe("PortalInviteDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("identifica el correo inválido y enfoca el campo antes de enviar", () => {
    const { email, enviar } = abrirDialogo();
    fireEvent.change(email, { target: { value: "correo-sin-dominio" } });
    fireEvent.click(enviar);

    expect(email).toHaveAccessibleDescription("Escribe un correo electrónico válido.");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveFocus();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it.each(["botón", "formulario"])("envía el correo limpio desde el %s", (via) => {
    const { email, enviar } = abrirDialogo();
    expect(enviar.form).toBe(email.form);
    fireEvent.change(email, { target: { value: "  persona@empresa.test  " } });
    if (via === "botón") {
      fireEvent.click(enviar);
    } else {
      fireEvent.submit(email.form!);
    }

    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith(
      { email: "persona@empresa.test", cliente_id: "cliente-demo", organization_id: "org-demo" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});

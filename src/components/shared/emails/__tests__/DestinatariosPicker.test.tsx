import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { DestinatariosPicker } from "../DestinatariosPicker";

const contactoCliente = {
  id: "__cliente_principal__",
  nombre: "Juan",
  contacto: "Juan",
  email: "juan@cliente.com",
  tipo: "Cliente",
};
const contactoProveedor = {
  id: "p1",
  nombre: "Prov",
  contacto: "Prov",
  email: "prov@x.com",
  tipo: "proveedor",
};

function make(overrides: Partial<React.ComponentProps<typeof DestinatariosPicker>> = {}) {
  const props = {
    contactos: [contactoCliente, contactoProveedor],
    loadingContactos: false,
    seleccionados: { [contactoCliente.id]: true },
    onToggle: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<DestinatariosPicker {...props} />) };
}

describe("DestinatariosPicker", () => {
  it.each(["Proveedor", "Shipper", "Exportador", "Fabricante"])(
    "renderiza el correo principal y oculta contactos de tipo %s",
    (tipo) => {
      make({ contactos: [contactoCliente, { ...contactoProveedor, tipo }] });
      expect(screen.getByText("Email principal del cliente")).toBeInTheDocument();
      expect(screen.getByText("juan@cliente.com")).toBeInTheDocument();
      expect(screen.getByRole("checkbox")).toBeChecked();
      expect(screen.queryByText("prov@x.com")).not.toBeInTheDocument();
    },
  );

  it("muestra loading y no renderiza cuando la lista está vacía", () => {
    const { unmount } = make({ contactos: [], loadingContactos: true });
    expect(screen.getByText(/Cargando contactos/)).toBeInTheDocument();
    unmount();
    const { container } = make({ contactos: [], loadingContactos: false });
    expect(container).toBeEmptyDOMElement();
  });
});

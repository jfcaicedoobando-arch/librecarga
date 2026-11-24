import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FacturaTimbradoCard } from "../FacturaTimbradoCard";

vi.mock("@/features/facturacion/hooks/useEmisorEmpresa", () => ({
  useEmisorEmpresa: () => ({ data: { razonSocial: "Organización actual", rfc: "RFC-SIMULADO" } }),
}));

it("distingue el perfil actual de los datos históricos del CFDI", () => {
  render(<FacturaTimbradoCard uuidFiscal="uuid-historico" folioFiscal={128} serie="F" />);
  expect(screen.getByText(/Perfil fiscal actual de la organización/)).toBeInTheDocument();
  expect(screen.getByText("Organización actual")).toBeInTheDocument();
  expect(screen.getByText("uuid-historico")).toBeInTheDocument();
  expect(screen.queryByText(/Emitido por/)).not.toBeInTheDocument();
});

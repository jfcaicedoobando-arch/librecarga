import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FacturapiApiKeyRow } from "../FacturapiApiKeyRow";

vi.mock("@/features/configuracion/hooks/useFacturapiCredenciales", () => ({
  useSetFacturapiApiKey: () => ({ isPending: false }),
  useClearFacturapiApiKey: () => ({ isPending: false }),
  useProbarFacturapiConexion: () => ({ isPending: false }),
}));

it("distingue la llave guardada de una sustituta sin guardar", () => {
  render(<FacturapiApiKeyRow orgId="qa" ambiente="sandbox" label="Pruebas" prefijo="sk_test_" last4="0001" />);
  const probar = screen.getByRole("button", { name: "Probar llave guardada" });
  const campo = screen.getByLabelText("API key — Pruebas");

  expect(probar).toBeEnabled();
  fireEvent.change(campo, { target: { value: "sustituta-sintetica" } });
  expect(probar).toBeDisabled();
  expect(campo).toHaveAccessibleDescription("Guarda la llave ingresada antes de probar la conexión.");
  fireEvent.change(campo, { target: { value: "" } });
  expect(probar).toBeEnabled();
});

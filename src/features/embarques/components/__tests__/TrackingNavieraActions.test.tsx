import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrackingNavieraActions } from "../tracking/TrackingNavieraActions";

const catalogo = vi.hoisted(() => ({ useNavieras: vi.fn() }));
vi.mock("@/features/catalogos/hooks/useNavieras", () => catalogo);

const props = {
  modo: "Marítimo", naviera: "Naviera de prueba", aerolinea: null, mawb: null, blMaster: null,
};

beforeEach(() => {
  catalogo.useNavieras.mockReturnValue({ data: [], isLoading: false, isError: false });
});

describe("TrackingNavieraActions", () => {
  it("muestra junto a las acciones cómo corregir la referencia faltante", () => {
    render(<TrackingNavieraActions {...props} />);
    const copiar = screen.getByRole("button", { name: "Copiar BL Master" });
    const enlace = screen.getByRole("button", { name: /Abrir tracking/ });
    expect(copiar).toBeDisabled();
    expect(enlace).toBeDisabled();
    expect(copiar).toHaveAccessibleDescription("Captura el BL Master en Resumen.");
    expect(enlace).toHaveAccessibleDescription("Captura el BL Master en Resumen.");
    expect(screen.getByText("Captura el BL Master en Resumen.")).toBeVisible();
  });

  it("explica cuándo falta el enlace y preserva la copia", () => {
    render(<TrackingNavieraActions {...props} blMaster="BL01" />);
    expect(screen.getByText(/no tiene un enlace de tracking configurado/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Copiar BL Master" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Abrir tracking/ })).toBeDisabled();
  });

  it("orienta el tracking aéreo sin ofrecer un enlace inoperante", () => {
    render(<TrackingNavieraActions {...props} modo="Aéreo" naviera={null}
      aerolinea="Aerolínea de prueba" mawb="123456789" />);
    expect(screen.getByRole("button", { name: "Copiar MAWB" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Abrir tracking/ })).toBeNull();
    expect(screen.getByText("Consulta el sitio de la aerolínea con este MAWB.")).toBeVisible();
  });

  it("abre el enlace configurado con el BL codificado", () => {
    catalogo.useNavieras.mockReturnValue({
      data: [{ name: props.naviera, code: "QA", tracking_url_template: "https://example.test/?bl={BL}" }],
    });
    const abrir = vi.spyOn(window, "open").mockReturnValue(null);
    try {
      render(<TrackingNavieraActions {...props} blMaster="BL/01" />);
      fireEvent.click(screen.getByRole("button", { name: /Abrir tracking/ }));
      expect(abrir).toHaveBeenCalledWith("https://example.test/?bl=BL%2F01", "_blank", "noopener,noreferrer");
    } finally {
      abrir.mockRestore();
    }
  });
});

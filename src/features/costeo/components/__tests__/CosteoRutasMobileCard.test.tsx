import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { FilaRuta } from "../CosteoRutasTable";
import { CosteoRutasMobileCard } from "../CosteoRutasMobileCard";

const fila: FilaRuta = {
  ruta: {
    id: "ruta-qa",
    puerto_origen_nombre: "Shanghái",
    puerto_destino_nombre: "Manzanillo",
    tarifas_vigentes_count: 2,
    proxima_expiracion: "2026-11-24",
  },
  meta: { key: "por_vencer", label: "Vence en 2d", tone: "warning", sortOrder: 2 },
};

it("muestra en móvil la fecha de la tarifa más próxima a vencer", () => {
  render(<CosteoRutasMobileCard fila={fila} onVer={vi.fn()} onEliminar={vi.fn()} />);
  expect(screen.getByText(/Próxima a vencer/)).toHaveTextContent("Próxima a vencer · 24/11/2026");
  expect(screen.getByText("24/11/2026")).toHaveAttribute("datetime", "2026-11-24");
});

it("omite la fecha cuando no hay vencimiento registrado", () => {
  render(
    <CosteoRutasMobileCard
      fila={{ ...fila, ruta: { ...fila.ruta, proxima_expiracion: null } }}
      onVer={vi.fn()}
      onEliminar={vi.fn()}
    />,
  );
  expect(screen.queryByText(/Próxima a vencer/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ver tarifas" })).toBeEnabled();
});

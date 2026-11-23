import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Tabs } from "@/components/ui/tabs";
import { BandejaTabs, type BandejaId } from "../BandejaTabs";

vi.mock("@/features/facturacion/hooks", () => ({
  useHuecoFacturacionCount: () => ({ data: 0 }),
}));
vi.mock("@/features/facturacion/hooks/useBandejas", () => ({
  useBandejaConteos: () => ({ data: {} }),
}));
vi.mock("@/features/facturacion/hooks/useProformasListas", () => ({
  useProformasListasCount: () => ({ data: 0 }),
}));

function Navegacion() {
  const [active, setActive] = useState<BandejaId>("por-timbrar");
  return (
    <TooltipProvider>
      <Tabs value={active} onValueChange={(v) => setActive(v as BandejaId)}>
        <BandejaTabs activeBandeja={active} onSelect={setActive} />
        <output data-testid="active">{active}</output>
      </Tabs>
    </TooltipProvider>
  );
}

describe("BandejaTabs", () => {
  it("conserva Vencidas al volver a pulsar Cobrar", () => {
    render(<Navegacion />);
    fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Vencidas/ }), { button: 0, ctrlKey: false });
    expect(screen.getByTestId("active")).toHaveTextContent("vencidas");
    fireEvent.click(screen.getByRole("button", { name: "Cobrar", pressed: true }));
    expect(screen.getByTestId("active")).toHaveTextContent("vencidas");
  });

  it("mantiene las nueve bandejas accesibles en tres etapas compactas", () => {
    render(<Navegacion />);
    expect(screen.getByRole("tab", { name: /por timbrar/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));
    expect(screen.getByTestId("active")).toHaveTextContent("por-cobrar");
    expect(screen.getByRole("tab", { name: /rep pendientes/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Histórico" }));
    expect(screen.getByTestId("active")).toHaveTextContent("emitidas");
    expect(screen.getByRole("tab", { name: /notas de crédito/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^REPs/i })).toBeInTheDocument();
  });
});

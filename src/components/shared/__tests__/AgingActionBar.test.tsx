import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgingActionBar } from "../AgingActionBar";

const options = [
  { value: "todas", label: "Todas" },
  { value: "vigente", label: "Vigente" },
];

describe("AgingActionBar", () => {
  it("expone la cubeta seleccionada y exporta desde el menú con su conteo", async () => {
    const onChange = vi.fn();
    const onExport = vi.fn();
    render(<AgingActionBar options={options} cubeta="todas" onChange={onChange}
      onExport={onExport} exportCount={4} exportDisabled={false} />);
    expect(screen.getByRole("button", { name: "Todas" })).toHaveAttribute("aria-pressed", "true");
    const vigente = screen.getByRole("button", { name: "Vigente" });
    expect(vigente).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(vigente);
    expect(onChange).toHaveBeenCalledWith("vigente");
    fireEvent.keyDown(screen.getByRole("button", { name: "Más acciones" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Exportar CSV (4)" }));
    expect(onExport).toHaveBeenCalledOnce();
  });

  it("permite deshabilitar la exportación sin mostrar un conteo ausente", async () => {
    render(<AgingActionBar options={options} cubeta="todas" onChange={vi.fn()}
      onExport={vi.fn()} exportDisabled />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Más acciones" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: "Exportar CSV" })).toHaveAttribute("aria-disabled", "true");
  });
});

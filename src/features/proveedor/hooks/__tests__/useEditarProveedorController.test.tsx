import { renderHook, act, fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import EditarProveedorIdentidadFields from "../../components/EditarProveedorIdentidadFields";
import { useEditarProveedorController } from "../useEditarProveedorController";

const mockProveedor: any = {
  id: "1",
  nombre: "Old Name",
  tipo: "Naviera",
  rfc: "RFC1",
  origen_proveedor: "Nacional",
  email: "old@test.com",
};

describe("useEditarProveedorController", () => {
  it("validates form fields", () => {
    const { result } = renderHook(() => useEditarProveedorController(mockProveedor, true, vi.fn(), vi.fn()));
    
    act(() => {
      result.current.setField("email", "invalid-email");
      result.current.markTouched("email");
    });
    
    expect(result.current.isValid).toBe(false);
    expect(result.current.fieldErrorMessage("email")).toBe("Correo inválido.");
  });

  it("handles saving when valid", async () => {
    const onSave = vi.fn();
    const { result } = renderHook(() => useEditarProveedorController(mockProveedor, true, onSave, vi.fn()));
    
    act(() => {
      result.current.setField("nombre", "New Name");
    });
    
    await act(async () => {
      await result.current.handleSave();
    });
    
    expect(onSave).toHaveBeenCalledWith(
      "1",
      expect.objectContaining({ nombre: "New Name" }),
      undefined,
      undefined,
    );
  });

  it("asocia el error al selector obligatorio de un proveedor histórico de gasto", async () => {
    const proveedor = { ...mockProveedor, categoria: "GastoOperativo", subtipo_gasto: null };
    const onSave = vi.fn();
    const onClose = vi.fn();
    function Formulario() {
      const c = useEditarProveedorController(proveedor, true, onSave, onClose);
      return <EditarProveedorIdentidadFields c={c} />;
    }
    render(<Formulario />);

    const subtipo = screen.getByRole("combobox", { name: /Subtipo de gasto/i });
    expect(subtipo).toHaveAttribute("aria-required", "true");
    fireEvent.blur(subtipo);
    expect(subtipo).toHaveAttribute("aria-invalid", "true");
    expect(subtipo).toHaveAccessibleDescription("El subtipo de gasto es requerido");
    fireEvent.keyDown(subtipo, { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "Renta" }));
    expect(subtipo).toHaveTextContent("Renta");
    expect(subtipo).not.toHaveAttribute("aria-invalid");
    expect(subtipo).not.toHaveAccessibleDescription();
    expect(onSave).not.toHaveBeenCalled();
  });
});

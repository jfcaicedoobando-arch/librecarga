import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EmailChipsField } from "../EmailChipsField";

it.each([false, true])("deja que Tab mueva el foco y confirma al salir (Mayús=%s)", (shiftKey) => {
  const onAdd = vi.fn();
  render(<EmailChipsField placeholder="Correo de prueba" chips={[]} onAdd={onAdd} onRemove={vi.fn()} ariaLabel="Para" />);
  const input = screen.getByPlaceholderText("Correo de prueba");
  fireEvent.change(input, { target: { value: "demo@example.invalid" } });

  expect(fireEvent.keyDown(input, { key: "Tab", shiftKey })).toBe(true);
  expect(onAdd).not.toHaveBeenCalled();
  fireEvent.blur(input);
  expect(onAdd).toHaveBeenCalledExactlyOnceWith("demo@example.invalid");
});

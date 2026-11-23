import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFocusSection } from "../useFocusSection";

function Documentos() {
  const { focus, registerRef, clearFocus } = useFocusSection(true);
  return (
    <section ref={registerRef("faltantes")} aria-label="Documentos">
      {focus === "faltantes" && <p>Documentos faltantes</p>}
      <button type="button" onClick={clearFocus}>Limpiar filtro</button>
    </section>
  );
}

const scrollOriginal = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

afterEach(() => {
  if (scrollOriginal) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollOriginal);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  window.history.replaceState(null, "", "/");
});

describe("Filtro de documentos faltantes", () => {
  it("retira el resaltado sin quitar el filtro compartible", async () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true, get: () => scroll,
    });
    window.history.replaceState(null, "", "/embarques/e1?tab=documentos&focus=faltantes&ids=d1");
    const { rerender } = render(<BrowserRouter><Documentos /></BrowserRouter>);

    const section = screen.getByRole("region", { name: "Documentos" });
    await waitFor(() => expect(section).toHaveClass("ring-2"));
    expect(scroll).toHaveBeenCalledOnce();
    await waitFor(() => expect(section).not.toHaveClass("ring-2"), { timeout: 4000 });
    expect(new URLSearchParams(window.location.search).get("focus")).toBe("faltantes");
    rerender(<BrowserRouter key="recarga"><Documentos /></BrowserRouter>);
    expect(screen.getByText("Documentos faltantes")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtro" }));
    await waitFor(() => expect(screen.queryByText("Documentos faltantes")).toBeNull());
    expect(window.location.search).toBe("?tab=documentos");
  });
});

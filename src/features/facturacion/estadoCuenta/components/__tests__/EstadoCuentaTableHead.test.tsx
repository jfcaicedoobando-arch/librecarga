import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EstadoCuentaTableHead } from "../EstadoCuentaTableHead";

describe("Encabezado de Estado de cuenta", () => {
  it("anuncia la columna ordenada y conserva las acciones de orden", () => {
    const onSort = vi.fn();
    const { rerender } = render(
      <table><EstadoCuentaTableHead sort={{ key: "fecha", dir: "desc" }} onSort={onSort} /></table>,
    );

    expect(screen.getByRole("columnheader", { name: "Fecha" })).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("columnheader", { name: "Saldo" })).toHaveAttribute("aria-sort", "none");
    fireEvent.click(screen.getByRole("button", { name: "Saldo" }));
    expect(onSort).toHaveBeenCalledExactlyOnceWith("saldo");

    rerender(<table><EstadoCuentaTableHead sort={{ key: "saldo", dir: "asc" }} onSort={onSort} /></table>);
    expect(screen.getByRole("columnheader", { name: "Saldo" })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("columnheader", { name: "Fecha" })).toHaveAttribute("aria-sort", "none");
  });
});

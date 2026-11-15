// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { DataTable, defineColumns } from "@/components/shared/DataTable";
import { buildSelectionColumn } from "../buildSelectionColumn";
import { useRowSelection } from "../useRowSelection";

const data = [{ id: "a", nombre: "Cliente A" }, { id: "b", nombre: "Cliente B" }];
type Item = typeof data[number];

function Fixture({ onOpen, href = false }: { onOpen: (item: Item) => void; href?: boolean }) {
  const selection = useRowSelection();
  const location = useLocation();
  const columns = defineColumns<Item>([
    buildSelectionColumn<Item>(),
    { id: "nombre", header: "Cliente", accessorFn: (item) => item.nombre },
    { id: "acciones", header: "Acciones", cell: ({ row }) => (
      <button type="button" onClick={() => onOpen(row.original)}>Acción {row.original.id}</button>
    ) },
    { id: "nota", header: "Nota", cell: ({ row }) => <input aria-label={`Nota ${row.original.id}`} /> },
  ]);
  return <>
    <DataTable columns={columns} data={data} rowKey={(item) => item.id}
      onRowClick={href ? undefined : onOpen}
      getRowHref={href ? (item) => `/clientes/${item.id}` : undefined}
      getRowAriaLabel={(item) => `Ver ${item.nombre}`}
      rowSelection={selection.rowSelection} onRowSelectionChange={selection.onRowSelectionChange} />
    <output data-testid="seleccion">{[...selection.selectedIds].sort().join(",")}</output>
    <output data-testid="ruta">{location.pathname}</output>
  </>;
}

function mount(href = false) {
  const onOpen = vi.fn();
  render(<Fixture onOpen={onOpen} href={href} />, { wrapper: MemoryRouter });
  return onOpen;
}

describe("DataTable — apertura por callback con teclado", () => {
  it.each(["Enter", " "])("enfoca la fila y abre una sola vez con %s", (key) => {
    const onOpen = mount();
    const row = screen.getByRole("button", { name: "Ver Cliente A" });
    row.focus();
    expect(row).toHaveFocus();
    expect(row).toHaveAttribute("tabindex", "0");
    expect(fireEvent.keyDown(row, { key })).toBe(false);
    fireEvent.keyUp(row, { key });
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(data[0]);
    expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/$/);
  });

  it("conserva clic de fila y no duplica el clic de su botón interno", () => {
    const onOpen = mount();
    fireEvent.click(screen.getByText("Cliente A"));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(data[0]);
    onOpen.mockClear();
    const button = screen.getByRole("button", { name: "Acción a" });
    fireEvent.keyDown(button, { key: "Enter" });
    // jsdom no ejecuta el clic nativo de Enter: lo despachamos explícitamente.
    fireEvent.click(button, { detail: 0 });
    fireEvent.keyUp(button, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(data[0]);
  });

  it("ignora teclado y clic dentro del input", () => {
    const onOpen = mount();
    const input = screen.getByRole("textbox", { name: "Nota a" });
    fireEvent.click(input);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: " " });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("conserva prioridad de selección sobre el callback", () => {
    const onOpen = mount();
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Seleccionar fila" })[0]);
    expect(screen.getByTestId("seleccion")).toHaveTextContent(/^a$/);
    const secondRow = screen.getByText("Cliente B").closest("tr")!;
    fireEvent.keyDown(secondRow, { key: "Enter" });
    expect(screen.getByTestId("seleccion")).toHaveTextContent(/^a,b$/);
    fireEvent.keyDown(secondRow, { key: " " });
    expect(screen.getByTestId("seleccion")).toHaveTextContent(/^a$/);
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Seleccionar fila" })[0]);
    expect(screen.getByTestId("seleccion")).toBeEmptyDOMElement();
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Ver Cliente A" })).toHaveAttribute("tabindex", "0");
  });

  it.each(["Enter", " "])("mantiene navegación de enlace con %s", (key) => {
    const onOpen = mount(true);
    const link = screen.getByRole("link", { name: "Ver Cliente A" });
    link.focus();
    expect(link).toHaveFocus();
    fireEvent.keyDown(link, { key });
    expect(screen.getByTestId("ruta")).toHaveTextContent(/^\/clientes\/a$/);
    expect(onOpen).not.toHaveBeenCalled();
  });
});

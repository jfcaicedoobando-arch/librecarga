import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmbarquesSortIndicator } from "../EmbarquesSortIndicator";
import { EmbarquesAlertasPanel } from "../EmbarquesAlertasPanel";
import { EmbarqueMobileCard } from "../EmbarqueMobileCard";
import { buildEmbarqueColumns } from "../../table/embarqueColumns";

const ceroAlertas = { demora: 0, garantia: 0, cierre_operativo: 0, admin_pendiente: 0, total: 0 };

function ListadoOrdenable() {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "expediente", dir: "desc" });
  return (
    <>
      <EmbarquesSortIndicator
        sortKey={sort.key}
        sortDir={sort.dir}
        onSortChange={(key, dir) => setSort({ key, dir })}
        onClear={() => setSort({ key: "expediente", dir: "desc" })}
      />
      <output>{`${sort.key}:${sort.dir}`}</output>
    </>
  );
}

describe("controles de listado de Embarques", () => {
  it("permite elegir ETA y dirección de orden desde móvil y restablecerlos", () => {
    render(<ListadoOrdenable />);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Ordenar embarques por" }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "ETA" }));
    expect(screen.getByText("eta:desc")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Dirección del orden" }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "Ascendente" }));
    expect(screen.getByText("eta:asc")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restablecer orden" }));
    expect(screen.getByText("expediente:desc")).toBeInTheDocument();
  });

  it("conserva el filtro de alertas activo y permite quitarlo con total cero", () => {
    const onSelect = vi.fn();
    render(<EmbarquesAlertasPanel resumen={ceroAlertas} activeAlerta="demora" onSelect={onSelect} />);
    expect(screen.getByText(/Filtro:/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Ver alertas" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "Ver alertas" }));
    expect(screen.getByRole("button", { name: "Ocultar alertas" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { pressed: true })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Ocultar alertas" }));
    expect(screen.queryByRole("button", { pressed: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver todos los embarques" }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("todos");
  });

  it("muestra la ETA móvil aun si falta y prioriza Estado y ETA en escritorio", () => {
    render(<EmbarqueMobileCard embarque={{
      id: "embarque-qa", expediente: "EXP-QA", cliente_nombre: "Cliente QA", estado: "Confirmado",
      modo: "Marítimo", tipo: "Importación", etd: null, eta: null, fecha_llegada_real: null,
    }} />);
    expect(screen.getByText("ETA: Por definir")).toBeVisible();
    const columnas = buildEmbarqueColumns({ docsMap: {} }).map((c) => c.id);
    const bl = columnas.indexOf("bl");
    expect(columnas.slice(0, bl)).toContain("estado");
    expect(columnas.slice(0, bl)).toContain("eta");
  });
});

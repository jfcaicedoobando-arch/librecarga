import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BuscadorObjetoCrm } from "@/features/crm/components/objetos/BuscadorObjetoCrm";
import { CampoAeropuerto } from "../CampoAeropuerto";
import { RutaAerea } from "../RutaAerea";

const estado = vi.hoisted(() => ({ error: false, reintentar: vi.fn() }));
vi.mock("@/features/crm/hooks/useBuscarAeropuertos", () => ({
  useBuscarAeropuertos: (termino: string) => ({
    data: termino === "ME" ? [{ iata: "MEX", nombre: "Ciudad de México", ciudad: null, pais: "México" }]
      : termino === "LA" ? [{ iata: "LAX", nombre: "Los Ángeles", ciudad: null, pais: "Estados Unidos" }] : [],
    isFetching: false, isError: estado.error && termino === "LA", refetch: estado.reintentar,
  }),
}));
vi.mock("@/features/crm/hooks/useObjetosCrm", () => ({
  useEmpresasCrm: () => ({ data: { filas: [] } }),
  useContactosCrm: () => ({ data: { filas: [
    { id: "ana-1", nombre: "Ana Rivera", email: "ana@example.test", telefono: null },
    { id: "ana-2", nombre: "Ana Rivera", email: null, telefono: "5550100" },
  ] } }),
}));

beforeEach(() => {
  estado.error = false;
  estado.reintentar.mockReset();
});

describe("selectores de CRM y Pricing", () => {
  it("conserva el ID correcto al ligar un contacto homónimo", () => {
    const onElegir = vi.fn();
    render(<BuscadorObjetoCrm objeto="contacto" excluir={[]} onElegir={onElegir} />);
    fireEvent.click(screen.getByRole("button", { name: "Ligar contacto" }));
    expect(screen.getByRole("option", { name: "Ana Rivera, ana@example.test" })).toBeVisible();
    fireEvent.click(screen.getByRole("option", { name: "Ana Rivera, 5550100" }));
    expect(onElegir).toHaveBeenCalledExactlyOnceWith("ana-2");
  });

  it("oculta opciones anteriores durante el debounce y permite recuperar la búsqueda actual", async () => {
    const onChange = vi.fn();
    const vista = <CampoAeropuerto id="a" label="Aeropuerto" value={null} onChange={onChange} />;
    const { rerender } = render(vista);
    fireEvent.click(screen.getByRole("combobox", { name: "Aeropuerto" }));
    const termino = screen.getByPlaceholderText("Código IATA, ciudad o nombre");
    fireEvent.change(termino, { target: { value: "ME" } });
    expect(await screen.findByRole("option", { name: /MEX/ })).toBeVisible();

    estado.error = true;
    fireEvent.change(termino, { target: { value: "LA" } });
    expect(screen.queryByRole("option", { name: /MEX/ })).not.toBeInTheDocument();
    expect(screen.getByText("Buscando aeropuertos…")).toBeVisible();
    fireEvent.keyDown(termino, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    expect(await screen.findByText("No pudimos consultar aeropuertos")).toBeVisible();
    expect(screen.queryByText("Sin resultados")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(estado.reintentar).toHaveBeenCalledOnce();

    estado.error = false;
    rerender(<CampoAeropuerto id="a" label="Aeropuerto" value={null} onChange={onChange} />);
    fireEvent.click(await screen.findByRole("option", { name: /LAX/ }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("LAX — Los Ángeles", expect.objectContaining({ iata: "LAX" }));
  });

  it("describe el aeropuerto repetido y permite limpiar solamente el destino", () => {
    const set = vi.fn();
    const repetido = { solicitante_id: "u1", pol: "MEX — México", pod: "MEX — México" };
    render(<RutaAerea datos={repetido} set={set} />);
    const destino = screen.getByRole("combobox", { name: "Aeropuerto de destino" });
    expect(destino).toHaveAttribute("aria-invalid", "true");
    expect(destino).toHaveAccessibleDescription("Origen y destino no pueden ser el mismo aeropuerto.");
    fireEvent.click(screen.getByRole("button", { name: "Quitar aeropuerto de destino" }));
    expect(set.mock.calls).toEqual([["pod", null], ["destino", null]]);
    expect(destino).toHaveFocus();
  });
});

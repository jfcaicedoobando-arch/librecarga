/**
 * Regla de la pantalla "Consultar empresa": el botón «Registrar empresa nueva»
 * sólo aparece cuando la búsqueda no devolvió ninguna coincidencia.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmpresaEncontrada } from "../../services/brokerPortal";

let resultados: EmpresaEncontrada[] = [];
let terminoConsultado: string | null = null;
let consultando = false;

vi.mock("../../hooks/useBrokerPortal", () => ({
  useBrokerOrganizaciones: () => ({
    data: [{ broker_id: "broker-1", organizacion: "Elogistix" }],
  }),
  useBuscarEmpresaBroker: () => ({
    data: resultados,
    isSuccess: true,
    isError: false,
    isFetching: consultando,
  }),
}));

vi.mock("@/hooks/shared", () => ({
  useDebounce: (value: string) => terminoConsultado ?? value,
  useDocumentTitle: () => {},
}));

vi.mock("../../components/SolicitudEmpresaDialog", () => ({
  default: () => null,
}));

vi.mock("../../components/AltaProspectoDialog", () => ({
  default: ({ nombreInicial }: { nombreInicial: string }) => <div>DIÁLOGO DE ALTA <span>{nombreInicial}</span></div>,
}));

vi.mock("../../components/MisSolicitudesBroker", () => ({
  default: () => null,
}));

import BrokerConsultar from "../BrokerConsultar";

const empresa = (nombre: string, esMia = false): EmpresaEncontrada => ({
  empresa_id: `emp-${nombre}`,
  nombre,
  tipo: "Prospecto",
  etapa: null,
  es_mia: esMia,
});

const buscar = (texto: string) => {
  render(<BrokerConsultar />);
  fireEvent.change(screen.getByLabelText("Buscar empresa"), { target: { value: texto } });
};

beforeEach(() => {
  resultados = [];
  terminoConsultado = null;
  consultando = false;
});

describe("BrokerConsultar · botón de alta", () => {
  it("oculta el botón cuando la búsqueda sí encontró empresas", () => {
    resultados = [empresa("saret broker prueba", true)];
    buscar("saret broker prueba");

    expect(screen.getByText("saret broker prueba")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Registrar empresa nueva/ })).not.toBeInTheDocument();
    expect(screen.queryByText("¿No es ninguna de estas?")).not.toBeInTheDocument();
  });

  it("muestra el botón cuando la búsqueda no encontró nada", () => {
    resultados = [];
    buscar("transportes ruiz");

    expect(screen.getByText("No encontramos esa empresa.")).toBeInTheDocument();
    const boton = screen.getByRole("button", { name: /Registrar empresa nueva/ });
    expect(boton).toBeInTheDocument();

    fireEvent.click(boton);
    expect(screen.getByText("DIÁLOGO DE ALTA")).toBeInTheDocument();
  });

  it("retira las acciones anteriores durante el debounce y la consulta del nuevo nombre", () => {
    terminoConsultado = "Naviera Alfa";
    resultados = [empresa("Naviera Alfa")];
    const vista = render(<BrokerConsultar />);
    const input = screen.getByLabelText("Buscar empresa");
    fireEvent.change(input, { target: { value: "Naviera Alfa" } });
    expect(screen.getByRole("button", { name: "Solicitar" })).toBeEnabled();

    fireEvent.change(input, { target: { value: "Naviera Beta" } });
    expect(screen.getByRole("status")).toHaveTextContent("Buscando");
    expect(screen.queryByRole("button", { name: "Solicitar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Registrar empresa nueva" })).toBeNull();

    terminoConsultado = "Naviera Beta";
    resultados = [];
    consultando = true;
    vista.rerender(<BrokerConsultar />);
    expect(screen.getByRole("status")).toHaveTextContent("Buscando");
    expect(screen.queryByRole("button", { name: "Registrar empresa nueva" })).toBeNull();

    consultando = false;
    vista.rerender(<BrokerConsultar />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar empresa nueva" }));
    expect(screen.getByText("Naviera Beta")).toBeVisible();
  });
});

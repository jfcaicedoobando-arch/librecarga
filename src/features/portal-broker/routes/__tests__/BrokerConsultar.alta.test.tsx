/**
 * Regla de la pantalla "Consultar empresa": el botón «Registrar empresa nueva»
 * sólo aparece cuando la búsqueda no devolvió ninguna coincidencia.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmpresaEncontrada } from "../../services/brokerPortal";

let resultados: EmpresaEncontrada[] = [];

vi.mock("../../hooks/useBrokerPortal", () => ({
  useBrokerOrganizaciones: () => ({
    data: [{ broker_id: "broker-1", organizacion: "Elogistix" }],
  }),
  useBuscarEmpresaBroker: () => ({
    data: resultados,
    isSuccess: true,
    isError: false,
  }),
}));

vi.mock("@/hooks/shared", () => ({
  useDebounce: (value: string) => value,
  useDocumentTitle: () => {},
}));

vi.mock("../../components/SolicitudEmpresaDialog", () => ({
  default: () => null,
}));

vi.mock("../../components/AltaProspectoDialog", () => ({
  default: () => <div>DIÁLOGO DE ALTA</div>,
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
});

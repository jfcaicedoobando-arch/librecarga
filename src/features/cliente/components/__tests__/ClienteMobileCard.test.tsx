import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClienteMobileCard } from "../ClienteMobileCard";
import type { ClienteRow } from "../clientesTableConfig";

const cliente: ClienteRow = {
  id: "cliente-demo", nombre: "Cliente Demo", rfc: "", ciudad: "", estado: "", contacto: "", telefono: "",
  limite_credito_mxn: 100,
  saldo_pendiente_mxn: 101,
};

describe("ClienteMobileCard", () => {
  it("muestra Crédito excedido al rebasar un límite positivo", () => {
    render(<ClienteMobileCard c={cliente} />);
    expect(screen.getByText("Crédito excedido")).toBeInTheDocument();
  });

  it.each([
    { limite_credito_mxn: 100, saldo_pendiente_mxn: 100 },
    { limite_credito_mxn: null, saldo_pendiente_mxn: 101 },
    { limite_credito_mxn: 0, saldo_pendiente_mxn: 101 },
    { limite_credito_mxn: 100, saldo_pendiente_mxn: null },
  ])("omite el aviso con saldo $saldo_pendiente_mxn y límite $limite_credito_mxn", (credito) => {
    render(<ClienteMobileCard c={{ ...cliente, ...credito }} />);
    expect(screen.queryByText("Crédito excedido")).not.toBeInTheDocument();
  });
});

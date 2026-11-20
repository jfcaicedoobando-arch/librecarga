import { describe, expect, it } from "vitest";
import { TABULADOR_BROKER, nombreServicio, serviciosDesglose } from "../tabuladorBroker";

describe("tabulador de brokers", () => {
  it("marítimo FCL 15% sin mínimo", () => {
    expect(TABULADOR_BROKER.find((t) => t.servicio === "maritimo_fcl")).toMatchObject({ pct: 15, minimo: null });
  });
  it("terrestre FTL 10% con mínimo de 20 USD", () => {
    expect(TABULADOR_BROKER.find((t) => t.servicio === "terrestre_ftl")).toMatchObject({ pct: 10, minimo: 20 });
  });
  it("lee el desglose guardado y tolera renglones sin desglose", () => {
    expect(serviciosDesglose(null)).toEqual([]);
    expect(serviciosDesglose({ servicios: [{ servicio: "aereo" }] })).toHaveLength(1);
    expect(nombreServicio("despacho_aduanal")).toBe("Despacho aduanal");
  });
});

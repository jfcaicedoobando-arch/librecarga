import { describe, expect, it } from "vitest";
import { quitarCodigoCargo } from "../catalogoCargos";

describe("quitarCodigoCargo", () => {
  it("quita el código del catálogo", () => {
    expect(quitarCodigoCargo("AGR-OA · Cargos en origen Agente")).toBe("Cargos en origen Agente");
  });
  it("deja igual textos sin código", () => {
    expect(quitarCodigoCargo("Flete Maritimo")).toBe("Flete Maritimo");
  });
});

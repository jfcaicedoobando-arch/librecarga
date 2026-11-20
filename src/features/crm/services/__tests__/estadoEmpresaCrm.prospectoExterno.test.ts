import { describe, expect, it } from "vitest";
import { ESTADOS_EMPRESA_CRM, estadoEmpresa } from "@/features/crm/services/estadoEmpresaCrm";
import { varianteEstadoEmpresa } from "@/features/crm/components/objetos/estadoEmpresaVisual";

describe("estado Prospecto externo", () => {
  it("está en el catálogo de estados y del filtro", () => {
    expect(ESTADOS_EMPRESA_CRM).toContain("Prospecto externo");
  });

  it("se respeta tal cual viene de la base", () => {
    expect(estadoEmpresa({ estado_crm: "Prospecto externo", cliente_id: null })).toBe("Prospecto externo");
  });

  it("tiene variante visual definida", () => {
    expect(varianteEstadoEmpresa("Prospecto externo")).toBe("default");
  });

  it("una empresa de broker dada de alta como cliente sigue mostrando Cliente", () => {
    expect(estadoEmpresa({ estado_crm: "Cliente", cliente_id: "c1" })).toBe("Cliente");
  });
});

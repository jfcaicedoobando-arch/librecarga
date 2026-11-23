import { describe, expect, it } from "vitest";
import { accionesDisponibles, enTrabajo, estaVencida, relojCorre } from "../estadosPricing";
import { modoPorDefecto } from "@/features/crm/components/pricing/TabsModoPricing";

const base = { asignada_a: null, solicitante_id: "vend", created_by: "vend" };

describe("estados de trabajo de Pricing", () => {
  it("Información requerida sigue abierta pero pausa el reloj", () => {
    expect(enTrabajo("info_requerida")).toBe(true);
    expect(relojCorre("info_requerida")).toBe(false);
    expect(enTrabajo("sin_opcion")).toBe(false);
  });
  it("Pricing puede tomar, iniciar, pedir información o cerrar sin opción una enviada", () => {
    expect(accionesDisponibles({ ...base, estado: "enviada" }, "pri", true))
      .toEqual(["tomar", "iniciar", "pedir_info", "sin_opcion"]);
  });
  it("el vendedor sólo puede reanudar cuando Pricing pidió información", () => {
    expect(accionesDisponibles({ ...base, estado: "info_requerida" }, "vend", false)).toEqual(["reanudar"]);
    expect(accionesDisponibles({ ...base, estado: "en_proceso" }, "vend", false)).toEqual([]);
  });
  it("vencida es etiqueta derivada y no aplica en pausa", () => {
    const ahora = new Date("2026-11-23T20:00:00Z");
    expect(estaVencida({ estado: "en_proceso", vence_at: "2026-11-23T19:00:00Z" }, ahora)).toBe(true);
    expect(estaVencida({ estado: "info_requerida", vence_at: "2026-11-23T19:00:00Z" }, ahora)).toBe(false);
  });
  it("un ejecutivo con un solo modo abre esa pestaña; con varios, Todas", () => {
    expect(modoPorDefecto(["Aéreo"])).toBe("Aéreo");
    expect(modoPorDefecto(["Aéreo", "Terrestre"])).toBe("todos");
  });
});

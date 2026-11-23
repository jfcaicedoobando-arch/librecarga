/**
 * v13.36.0 — Tests de auto-carga de costos desde tarifa marítima.
 * Cubren: flete base, recargos por lado, markup configurable, redondeo,
 * y omisión de montos no positivos.
 */
import { describe, it, expect } from "vitest";
import { buildCostosDesdeTarifa } from "../buildCostosDesdeTarifa";
import type { TopTarifaRow, CosteoTarifaRecargo } from "@/features/costeo/types";

const tarifa = {
  flete_base: 1000,
  naviera_nombre: "MSC",
  tipo_contenedor_nombre: "40HC",
} as unknown as TopTarifaRow;

const recargos: CosteoTarifaRecargo[] = [
  { id: "r1", tarifa_id: "t1", concepto: "BAF", lado: "origen", monto: 120, moneda: "USD", incluido_en_total: true },
  { id: "r2", tarifa_id: "t1", concepto: "ISPS", lado: "destino", monto: 25, moneda: "USD", incluido_en_total: true },
  { id: "r3", tarifa_id: "t1", concepto: "Vacío", lado: "origen", monto: 0, moneda: "USD", incluido_en_total: false },
];

describe("buildCostosDesdeTarifa", () => {
  it("genera fila de flete base + 1 por recargo con monto > 0", () => {
    const filas = buildCostosDesdeTarifa({ tarifa, recargos, markup: 0.15 });
    expect(filas).toHaveLength(3);
    expect(filas[0].concepto).toMatch(/Flete marítimo/);
    expect(filas[0].costo_unitario).toBe(1000);
    expect(filas[0].precio_venta).toBe(1150); // 1000 * 1.15
    expect(filas[1].concepto).toBe("BAF (origen)");
    expect(filas[1].precio_venta).toBe(138); // 120 * 1.15
    expect(filas[2].concepto).toBe("ISPS (destino)");
  });

  it("respeta moneda USD y proveedor=naviera", () => {
    const [primera] = buildCostosDesdeTarifa({ tarifa, recargos, markup: 0 });
    expect(primera.moneda).toBe("USD");
    expect(primera.proveedor).toBe("MSC");
    expect(primera.precio_venta).toBe(1000); // markup 0
  });

  it("aplica cantidad por defecto y permite override", () => {
    const filas = buildCostosDesdeTarifa({ tarifa, recargos: [], markup: 0.1, cantidad: 3 });
    expect(filas[0].cantidad).toBe(3);
  });

  it("omite tarifa sin flete base ni recargos", () => {
    const filas = buildCostosDesdeTarifa({
      tarifa: { ...tarifa, flete_base: 0 } as TopTarifaRow,
      recargos: [],
      markup: 0.15,
    });
    expect(filas).toHaveLength(0);
  });

  it("normaliza cantidad a mínimo 1 cuando llega 0 o negativa (regresión JAVASCRIPT-REACT-1M)", () => {
    const filasCero = buildCostosDesdeTarifa({ tarifa, recargos, markup: 0, cantidad: 0 });
    expect(filasCero.length).toBeGreaterThan(0);
    for (const f of filasCero) expect(f.cantidad).toBe(1);

    const filasNeg = buildCostosDesdeTarifa({ tarifa, recargos, markup: 0, cantidad: -3 });
    for (const f of filasNeg) expect(f.cantidad).toBe(1);
  });

  it("LCL: cambia unidad_medida a 'm³' y omite tipo_contenedor del label", () => {
    const filas = buildCostosDesdeTarifa({ tarifa, recargos, markup: 0, tipoEmbarque: "LCL" });
    expect(filas[0].concepto).toBe("Flete marítimo LCL");
    expect(filas[0].unidad_medida).toBe("m³");
    expect(filas[1].unidad_medida).toBe("m³");
  });

  it("FCL (default): conserva unidad 'contenedor' y menciona tipo_contenedor", () => {
    const filas = buildCostosDesdeTarifa({ tarifa, recargos, markup: 0 });
    expect(filas[0].concepto).toContain("40HC");
    expect(filas[0].unidad_medida).toBe("contenedor");
  });
});

describe("base y moneda de recargos", () => {
  const tarifa = { id: "t1", flete_base: 1000, naviera_nombre: "N", tipo_contenedor_nombre: "40HC" };
  const rec = (p: Partial<import("@/features/costeo/types").CosteoTarifaRecargo>) => ({
    id: "r", tarifa_id: "t1", concepto: "BL", lado: "origen" as const, monto: 50, moneda: "USD", incluido_en_total: true, ...p,
  });
  it("un recargo por embarque no se multiplica por contenedores", () => {
    const filas = buildCostosDesdeTarifa({ tarifa, recargos: [rec({ base: "por_embarque" })], markup: 0, cantidad: 3 });
    const bl = filas.find((f) => f.concepto.startsWith("BL"));
    expect(bl?.cantidad).toBe(1);
    expect(bl?.unidad_medida).toBe("embarque");
  });
  it("un recargo por unidad sí se multiplica", () => {
    const filas = buildCostosDesdeTarifa({ tarifa, recargos: [rec({ concepto: "BAF", base: "por_unidad" })], markup: 0, cantidad: 3 });
    expect(filas.find((f) => f.concepto.startsWith("BAF"))?.cantidad).toBe(3);
  });
  it("conserva MXN y rechaza EUR", () => {
    const filas = buildCostosDesdeTarifa({ tarifa, recargos: [rec({ moneda: "MXN" })], markup: 0 });
    expect(filas.find((f) => f.concepto.startsWith("BL"))?.moneda).toBe("MXN");
    expect(() => buildCostosDesdeTarifa({ tarifa, recargos: [rec({ moneda: "EUR" })], markup: 0 })).toThrow(/EUR/);
  });
});

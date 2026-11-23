import { roundMoney } from "@/lib/financial/financialUtils";
import { factorTotalNC, impuestosLineaNC } from "./impuestosNotaCredito";
import { calcularTotalesNC } from "./notaCreditoTotales";
import type { ConceptoNotaCredito } from "../services/notasCredito";

const centavos = (n: number) => Math.round(roundMoney(n) * 100);
type Ajuste = { indice: number; linea: ConceptoNotaCredito; delta: number };

/**
 * Busca precios cercanos al saldo; el cuadre agrupado también prueba milésimas
 * porque el subtotal y sus impuestos pueden redondear en puntos distintos.
 * Nunca devuelve una aproximación como si fuera el saldo completo. Algunas
 * combinaciones de impuestos no pueden representar cada centavo con una línea.
 */
export function ajustarSaldoFiscalNC(saldo: number, lineas: ConceptoNotaCredito[], agrupar = false): ConceptoNotaCredito[] | null {
  const objetivo = centavos(saldo);
  const total = (conceptos: ConceptoNotaCredito[]) => centavos(calcularTotalesNC(conceptos, agrupar).total);
  const actual = total(lineas);
  const diferencia = objetivo - actual;
  if (!Number.isSafeInteger(objetivo)) return null;
  if (diferencia === 0) return lineas;
  const ajustes: Ajuste[] = [];
  const aplicar = (a: Ajuste, b?: Ajuste) => lineas.map((l, i) => i === a.indice ? a.linea : i === b?.indice ? b.linea : l);
  for (const [indice, linea] of lineas.entries()) {
    const factor = factorTotalNC(linea);
    if (!(factor > 0)) return null;
    const original = centavos(impuestosLineaNC(linea).total);
    const centros = [centavos(linea.precio_unitario), centavos(linea.precio_unitario) + Math.round(diferencia / factor)];
    for (const precio of preciosCercanos(centros, agrupar)) {
      const candidata = { ...linea, precio_unitario: precio };
      const ajuste = { indice, linea: candidata, delta: centavos(impuestosLineaNC(candidata).total) - original };
      if (agrupar) ajuste.delta = total(aplicar(ajuste)) - actual;
      if (ajuste.delta === diferencia) return aplicar(ajuste);
      ajustes.push(ajuste);
    }
  }
  const verificaCuadre = agrupar ? (a: Ajuste, b: Ajuste) => total(aplicar(a, b)) === objetivo : undefined;
  const pareja = combinarAjustes(ajustes, diferencia, verificaCuadre);
  return pareja ? aplicar(...pareja) : null;
}

function preciosCercanos(centros: number[], agrupar: boolean): number[] {
  const precios = new Set<number>();
  const incrementos = agrupar ? [0, 5, 1, 2, 3, 4, 6, 7, 8, 9] : [0];
  for (const centro of centros) {
    // Tres impuestos redondeados pueden mover varios centavos del despeje.
    for (let offset = -4; offset <= 4; offset++) {
      for (const milesimas of incrementos) {
        const precio = ((centro + offset) * 10 + milesimas) / 1000;
        if (precio >= 0) precios.add(precio);
      }
    }
  }
  return [...precios];
}

function combinarAjustes(
  ajustes: Ajuste[], diferencia: number, verificaCuadre?: (a: Ajuste, b: Ajuste) => boolean,
): [Ajuste, Ajuste] | null {
  const porDelta = new Map<number, Ajuste[]>();
  // El subtotal y cada grupo de impuesto pueden mover un centavo al
  // combinar dos ajustes redondeados. Verificar el documento resultante.
  const margen = verificaCuadre ? 4 : 0;
  for (const a of ajustes) {
    for (let residuo = -margen; residuo <= margen; residuo++) {
      const candidatos = porDelta.get(diferencia - a.delta + residuo) ?? [];
      const pareja = candidatos.find((b) => b.indice !== a.indice && (!verificaCuadre || verificaCuadre(a, b)));
      if (pareja) return [a, pareja];
    }
    const grupo = porDelta.get(a.delta) ?? [];
    // Dos índices diferentes bastan para encontrar una pareja independiente.
    if (verificaCuadre || (grupo.length < 2 && !grupo.some((b) => b.indice === a.indice))) grupo.push(a);
    porDelta.set(a.delta, grupo);
  }
  return null;
}

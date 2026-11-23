/**
 * Defaults y derivados del formulario de factura manual.
 * Extraído de `useFacturaManualForm.ts` (límite Power-of-10 de 200 líneas).
 */
import { todayLocalISO } from "@/lib/date/today";
import type { ClienteFiscalOpt } from "@/features/facturacion/hooks/useClientesFiscalOpts";
import type { ConceptoManualInput } from "@/features/facturacion/services/facturaManual";
import type { DatosFiscalesValue } from "@/features/facturacion/components/FacturaManualDatosFiscales";
import { validarUsoCfdiIngreso } from "@/lib/financial/usoCfdiFiscal";

/**
 * Serie oficial por moneda. La numeración fiscal es responsabilidad del sistema
 * — nunca se deja al usuario porque contamina folios (ver v13.301.58).
 */
export function serieForMoneda(m: DatosFiscalesValue["moneda"]): string {
  if (m === "USD") return "SF43718";
  if (m === "EUR") return "SF46410";
  return "A";
}

export const INITIAL_FISCAL: DatosFiscalesValue = {
  serie: serieForMoneda("MXN"), fechaEmision: todayLocalISO(), diasCredito: 0, moneda: "MXN",
  usoCfdi: "G03", formaPago: "99", metodoPago: "PPD", tipoCambio: 1,
};

export const INITIAL_CONCEPTOS: ConceptoManualInput[] = [
  { descripcion: "", cantidad: 1, precio_unitario: 0, clave_sat: "78101800", tipo_iva: "gravado_16" },
];

/** El renglón inicial vacío no es captura del usuario. */
export function facturaManualIsDirty(
  clienteId: string,
  fiscal: DatosFiscalesValue,
  conceptos: ConceptoManualInput[],
  notas: string,
): boolean {
  return Boolean(clienteId || notas)
    || JSON.stringify(fiscal) !== JSON.stringify(INITIAL_FISCAL)
    || JSON.stringify(conceptos) !== JSON.stringify(INITIAL_CONCEPTOS);
}

interface DatosFaltantesTimbrar {
  tieneCliente: boolean;
  clienteIncompleto: boolean;
  conceptosValidos: boolean;
  totalCero: boolean;
  tipoCambio: number;
  tcFueraDeBanda: string | null;
  errorFormaMetodo: string | undefined;
  avisosUso: string[];
}

export function faltantesParaTimbrarManual(datos: DatosFaltantesTimbrar): string[] {
  return [
    !datos.tieneCliente && "cliente",
    !datos.conceptosValidos && "conceptos válidos",
    datos.totalCero && "un total mayor a cero",
    datos.tipoCambio <= 0 && "tipo de cambio",
    datos.errorFormaMetodo && "forma y método de pago compatibles",
    datos.clienteIncompleto && "datos fiscales del cliente (RFC · CP · régimen)",
    ...datos.avisosUso,
    datos.tcFueraDeBanda && "tipo de cambio plausible",
  ].filter((x): x is string => !!x);
}

/** Misma política que el diálogo normal y el preflight de la edge. */
export function validarUsoClienteManual(cliente: ClienteFiscalOpt | undefined, usoCfdi: string) {
  const rfc = cliente?.rfc ?? "";
  const regimen = cliente?.regimen_fiscal ?? "";
  const receptor = rfc.trim() && regimen.trim() ? { rfc, regimen } : undefined;
  const issues = validarUsoCfdiIngreso({ rfc, regimen, usoCfdi });
  return { receptor, issues, avisos: receptor ? issues.map((i) => i.message) : [] };
}

import { PORTAL_RELATED_MAX } from "@/features/portal/services/limits";

/** Agregado de saldo que devuelve la RPC del portal. */
export interface PortalResumenSaldo {
  pagado?: number | null;
  notasCredito?: number | null;
  saldo?: number | null;
  liquidada?: boolean | null;
  numPagos?: number | null;
  numNotas?: number | null;
}

export interface PortalSaldoDerivado {
  totalPagado: number | null;
  totalNc: number | null;
  saldo: number | null;
  liquidada: boolean;
  hayMovimientos: boolean;
  /** Las listas visibles están topadas aunque los totales sean completos. */
  listaTruncada: boolean;
}

/**
 * Deriva los importes visibles de una factura del portal a partir del agregado
 * completo en base de datos (defecto 7). Extraído del componente para respetar
 * el límite de complejidad (Power of 10).
 */
export function derivarSaldoPortal(
  resumen: PortalResumenSaldo | null | undefined,
  estadoFactura: string | null | undefined,
  numPagosVisibles: number,
  numNotasVisibles: number,
): PortalSaldoDerivado {
  const terminal = estadoFactura === "Pagada" || estadoFactura === "Cancelada";
  const num = (v: number | null | undefined): number => v ?? 0;
  return {
    totalPagado: resumen?.pagado ?? null,
    totalNc: resumen?.notasCredito ?? null,
    saldo: terminal ? 0 : resumen?.saldo ?? null,
    liquidada: terminal || num2bool(resumen?.liquidada),
    hayMovimientos: num(resumen?.numPagos) > 0 || num(resumen?.numNotas) > 0,
    listaTruncada:
      numPagosVisibles >= PORTAL_RELATED_MAX || numNotasVisibles >= PORTAL_RELATED_MAX,
  };
}

function num2bool(v: boolean | null | undefined): boolean {
  return v === true;
}

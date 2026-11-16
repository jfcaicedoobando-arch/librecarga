import { z } from "zod";
import Decimal from "decimal.js";

const dinero = z.number().finite().nonnegative().refine((n) => new Decimal(n).decimalPlaces() <= 2);
const bloqueSchema = z.object({
  moneda: z.enum(["MXN", "USD"]), subtotal: dinero, iva: dinero,
  ret_isr: dinero, ret_iva: dinero, total: dinero,
}).refine((b) => new Decimal(b.subtotal).plus(b.iva).minus(b.ret_isr).minus(b.ret_iva).equals(b.total));

export const snapshotFiscalCotizacionSchema = z.object({
  schema_version: z.literal("cotizacion_fiscal_v1"),
  estado: z.enum(["confirmado", "pendiente"]),
  organization_id: z.string().min(1), cliente_id: z.string().min(1).nullable(),
  perfil_id: z.string().min(1).nullable(), perfil_version: z.number().int().positive().nullable(),
  regla_version: z.string().min(1), precision_version: z.string().min(1),
  conceptos_fingerprint: z.string().min(1), ambiente: z.enum(["sandbox", "live"]),
  bloques: z.array(bloqueSchema).max(2).refine((bs) => new Set(bs.map((b) => b.moneda)).size === bs.length),
  motivos: z.array(z.string()),
});
const marcadorSchema = z.object({ ambiente: z.enum(["sandbox", "live"]), regla_version: z.string().min(1) }).strict();

export type SnapshotFiscalCotizacion = z.infer<typeof snapshotFiscalCotizacionSchema>;
export type BloqueFiscalCotizacion = z.infer<typeof bloqueSchema>;
export type LecturaFiscalCotizacion = SnapshotFiscalCotizacion | { estado: "legacy" } | { estado: "revision" } | { estado: "invalido" };

/** Null is historical, never an inferred fiscal decision. Malformed data cannot fall back. */
export function leerSnapshotFiscalCotizacion(value: unknown): LecturaFiscalCotizacion {
  if (value == null) return { estado: "legacy" };
  if (marcadorSchema.safeParse(value).success) return { estado: "revision" };
  const result = snapshotFiscalCotizacionSchema.safeParse(value);
  return result.success ? result.data : { estado: "invalido" };
}

export interface CotizacionConFiscal {
  organization_id: string;
  cliente_id?: string | null;
  estado: string;
  evaluacion_fiscal?: unknown;
}

export function fiscalCotizacionParaDocumento(cotizacion: CotizacionConFiscal): LecturaFiscalCotizacion {
  const fiscal = leerSnapshotFiscalCotizacion(cotizacion.evaluacion_fiscal);
  if (fiscal.estado === "legacy") return fiscal;
  if (fiscal.estado === "revision" || fiscal.estado === "invalido") {
    throw new Error("Revisa la evaluación fiscal de la cotización antes de generar el documento.");
  }
  if (fiscal.organization_id !== cotizacion.organization_id || fiscal.cliente_id !== (cotizacion.cliente_id ?? null)) {
    throw new Error("La evaluación fiscal no corresponde a la organización y cliente de la cotización.");
  }
  if (fiscal.estado === "pendiente" && !["Borrador", "Solicitada"].includes(cotizacion.estado)) {
    throw new Error("La cotización requiere una revisión fiscal antes de emitirse como definitiva.");
  }
  return fiscal;
}

export function exigirFiscalCotizacionParaEnvio(cotizacion: CotizacionConFiscal): LecturaFiscalCotizacion {
  const fiscal = fiscalCotizacionParaDocumento(cotizacion);
  if (fiscal.estado === "pendiente") throw new Error("Resuelve la evaluación fiscal pendiente antes de enviar la cotización.");
  return fiscal;
}

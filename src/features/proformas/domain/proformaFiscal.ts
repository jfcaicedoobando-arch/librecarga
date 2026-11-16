import { z } from "zod";
import { leerSnapshotFiscalCotizacion, snapshotFiscalCotizacionSchema } from "@/features/cotizacion/domain/snapshotFiscalCotizacion";
import type { BloqueFiscalCotizacion } from "@/features/cotizacion/domain/snapshotFiscalCotizacion";
import type { TotalesProforma } from "./proforma";

const conceptoDocumentoSchema = z.object({
  id: z.string(), descripcion: z.string(), cantidad: z.number().finite(), precio_unitario: z.number().finite(),
  moneda: z.string(), aplica_iva: z.boolean().nullable().optional(), tasa_iva_aplicada: z.number().nullable().optional(),
  tipo_iva: z.string().nullable().optional(),
  embarque_contenedores: z.object({ id: z.string(), numero_contenedor: z.string(), tipo_contenedor: z.string().nullable() }).nullable().optional(),
});

export type ConceptoProformaDocumento = z.infer<typeof conceptoDocumentoSchema>;

interface ProformaConEvaluacion {
  organization_id?: string;
  cliente_id?: string | null;
  evaluacion_fiscal?: unknown;
  conceptos_fiscales?: unknown;
}

export function leerFiscalProforma(proforma: ProformaConEvaluacion) {
  const fiscal = leerSnapshotFiscalCotizacion(proforma.evaluacion_fiscal);
  if (fiscal.estado === "legacy") return null;
  if (fiscal.estado !== "confirmado" || fiscal.organization_id !== proforma.organization_id
    || fiscal.cliente_id !== proforma.cliente_id || fiscal.bloques.length === 0) {
    throw new Error("Revisa la evaluación fiscal guardada de la proforma.");
  }
  return fiscal;
}

/** Al liberar los renglones vivos, el documento conserva los que fueron aprobados. */
export function leerConceptosFiscalesProforma(proforma: ProformaConEvaluacion): ConceptoProformaDocumento[] | null {
  if (!leerFiscalProforma(proforma)) return null;
  return z.array(conceptoDocumentoSchema).min(1).parse(proforma.conceptos_fiscales);
}

export function totalesNativosProforma(bloques: BloqueFiscalCotizacion[]): TotalesProforma {
  const usd = bloques.find((b) => b.moneda === "USD");
  const mxn = bloques.find((b) => b.moneda === "MXN");
  return {
    subtotal_usd: usd?.subtotal ?? 0, iva_usd: usd?.iva ?? 0, total_usd: usd?.total ?? 0,
    subtotal_mxn: mxn?.subtotal ?? 0, iva_mxn: mxn?.iva ?? 0, total_mxn: mxn?.total ?? 0,
  };
}

export const bloquesFiscalesProformaSchema = snapshotFiscalCotizacionSchema.shape.bloques;

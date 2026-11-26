import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { calcularImportesManual } from "../domain/facturaManualCalculo";
import type { ConceptoManualInput } from "./facturaManualLineas";

const monto = z.number().finite().nonnegative();
const respuestaFiscal = z.object({
  snapshot: z.object({
    organization_id: z.string(),
    cliente_id: z.string().nullable(),
    estado: z.enum(["confirmado", "pendiente"]),
    bloques: z.array(z.object({
      moneda: z.string(), subtotal: monto, iva: monto, ret_isr: monto, ret_iva: monto, total: monto,
    })),
  }).nullable(),
});

export type CapturaFiscalManual = {
  organizationId: string;
  clienteId: string;
  moneda: string;
  conceptos: ConceptoManualInput[];
  tasaIva: number;
};

/** Consulta el mismo evaluador que congela el borrador al guardarlo. */
export async function consultarVistaFiscalManual(captura: CapturaFiscalManual, signal: AbortSignal) {
  const lineas = captura.conceptos.map((concepto) => {
    const { cantidad, tasaFila } = calcularImportesManual(concepto, captura.tasaIva);
    return { cantidad, precio_unitario: concepto.precio_unitario, moneda: captura.moneda,
      tipo_iva: concepto.tipo_iva ?? "gravado_16", tasa_iva_aplicada: tasaFila };
  });
  const { data, error } = await supabase.rpc("evaluar_documento_isr_resico", {
    p_org_id: captura.organizationId, p_cliente_id: captura.clienteId, p_conceptos: lineas,
  }).abortSignal(signal);
  if (error) throw error;
  const { snapshot } = respuestaFiscal.parse(data);
  if (snapshot === null) return null;
  if (snapshot.organization_id !== captura.organizationId || snapshot.cliente_id !== captura.clienteId) {
    throw new Error("La evaluación fiscal corresponde a otra captura.");
  }
  const bloque = snapshot.bloques.find((documento) => documento.moneda === captura.moneda);
  if (snapshot.estado !== "confirmado" || !bloque || bloque.total <= 0) {
    throw new Error("Revisa la configuración fiscal antes de continuar.");
  }
  return bloque;
}

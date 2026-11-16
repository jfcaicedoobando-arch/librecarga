import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "@/lib/supabase/response";
import { toDbJson } from "@/lib/supabase/cast";
import { leerSnapshotFiscalCotizacion, type SnapshotFiscalCotizacion } from "@/features/cotizacion/domain/snapshotFiscalCotizacion";
import { buildConceptosVentaPayload } from "../domain/mappers/embarqueToDbConceptos";
import type { ConceptoVentaLocal } from "@/types/concepto";

const respuestaSchema = z.object({ snapshot: z.unknown(), conceptos: z.array(z.unknown()) });

export function validarRespuestaFiscalEmbarque(value: unknown, organizationId: string, clienteId?: string): SnapshotFiscalCotizacion | null {
  const response = respuestaSchema.parse(value);
  if (!("snapshot" in response)) throw new Error("Falta el desglose fiscal del embarque.");
  const fiscal = leerSnapshotFiscalCotizacion(response.snapshot);
  if (fiscal.estado === "legacy") return null;
  if (fiscal.estado === "invalido" || fiscal.estado === "revision") throw new Error("Revisa la evaluación fiscal del embarque.");
  if (fiscal.organization_id !== organizationId || (clienteId !== undefined && fiscal.cliente_id !== clienteId)) {
    throw new Error("La evaluación fiscal no corresponde al embarque.");
  }
  return fiscal;
}

export async function consultarFiscalEmbarque(embarqueId: string, organizationId: string) {
  const data = await unwrap(supabase.rpc("obtener_evaluacion_fiscal_embarque", { p_embarque_id: embarqueId }));
  return validarRespuestaFiscalEmbarque(data, organizationId);
}

export async function previsualizarFiscalEmbarque(input: { organizationId: string; clienteId: string; embarqueId?: string; conceptos: ConceptoVentaLocal[] }) {
  const data = await unwrap(supabase.rpc("evaluar_documento_isr_resico", {
    p_org_id: input.organizationId, p_cliente_id: input.clienteId,
    p_embarque_id: input.embarqueId,
    p_conceptos: toDbJson(buildConceptosVentaPayload(input.conceptos)),
  }));
  return validarRespuestaFiscalEmbarque(data, input.organizationId, input.clienteId);
}

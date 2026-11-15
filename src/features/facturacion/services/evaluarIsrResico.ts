import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { fromDb } from "@/lib/supabase/cast";
import { unwrap } from "@/lib/supabase/response";
import { fetchAmbienteEmision } from "./datosFiscalesCliente";
import type { TipoIvaConcepto } from "./conceptosFacturaShared";

const resultadoSchema = z.object({
  estado: z.enum(["aplica", "no_aplica", "pendiente"]),
  motivo: z.string(),
  monto_ret_isr: z.number().nullable(),
});

export interface DatosEstimacionIsr {
  organizationId: string;
  clienteId: string;
  cantidad: number;
  precioUnitario: number;
  tipoIva: TipoIvaConcepto;
}

export async function evaluarIsrResico(datos: DatosEstimacionIsr) {
  const ambiente = await fetchAmbienteEmision(datos.organizationId);
  if (ambiente !== "sandbox" && ambiente !== "live") {
    return { estado: "pendiente" as const, motivo: "conexion_pendiente", monto_ret_isr: null };
  }
  const resultado = await unwrap(supabase.rpc("evaluar_isr_resico", {
    p_org_id: datos.organizationId,
    p_cliente_id: datos.clienteId,
    p_ambiente: ambiente,
    p_cantidad: datos.cantidad,
    p_precio_unitario: datos.precioUnitario,
    p_tipo_iva: datos.tipoIva,
  }));
  return fromDb(resultado, resultadoSchema);
}

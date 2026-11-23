import { supabase } from "@/integrations/supabase/client";
import { recargosParaRpc } from "./mutations";
import type { TarifaRecargoInput } from "@/features/costeo/services/tarifas";
import { payloadTarifaMultimodo, type TarifaMultimodoForm } from "@/features/costeo/domain/tarifaMultimodo";

/** Alta de tarifa aérea o terrestre con sus rangos de peso y recargos, en una transacción. */
export async function crearTarifaMultimodo(organizationId: string, form: TarifaMultimodoForm, recargos: TarifaRecargoInput[] = []): Promise<void> {
  const { error } = await supabase.rpc("crear_tarifa_con_recargos_rpc", {
    p_organization_id: organizationId,
    p_tarifa: payloadTarifaMultimodo(form) as never, // SAFE-CAST: jsonb validado en servidor.
    p_recargos: recargosParaRpc(recargos),
  });
  if (error) {
    if (error.code === "23503") throw new Error("Aeropuerto no encontrado en el catálogo IATA.");
    if (error.code === "23514") throw new Error("Faltan datos obligatorios para este modo de transporte.");
    throw new Error(error.message);
  }
}

import { supabase } from "@/integrations/supabase/client";
import { perfilFiscalEmisorSchema } from "../domain/perfilFiscalEmisor";
import type { FacturapiAmbiente } from "./facturapiCredenciales";

export interface SolicitudPerfilFiscal {
  organization_id: string;
  ambiente: FacturapiAmbiente;
  accion: "consultar" | "sincronizar" | "confirmar";
  perfil_id?: string;
  vigente_desde?: string | null;
}

export async function solicitarPerfilFiscal(body: SolicitudPerfilFiscal) {
  const { data, error } = await supabase.functions.invoke<unknown>("facturapi-perfil-fiscal", { body });
  if (error) {
    let message = "No se pudo consultar el perfil fiscal. Intenta nuevamente.";
    if (error.context instanceof Response) {
      const detail: unknown = await error.context.clone().json().catch(() => null);
      if (detail && typeof detail === "object" && "message" in detail && typeof detail.message === "string") {
        message = detail.message;
      }
    }
    throw new Error(message);
  }
  const result = perfilFiscalEmisorSchema.parse(data);
  if (result.ambiente !== body.ambiente || (result.perfil && (
    result.perfil.organization_id !== body.organization_id || result.perfil.ambiente !== body.ambiente))) {
    throw new Error("El perfil recibido no corresponde a la organización y ambiente seleccionados.");
  }
  return result;
}

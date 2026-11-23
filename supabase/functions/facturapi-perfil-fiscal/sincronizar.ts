import type { SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";
import { resolveFacturapiKey, type FacturapiAmbiente } from "../_shared/facturapiAuth.ts";
import { consultarPerfilProveedor, PerfilFiscalError } from "../_shared/facturapiPerfilProveedor.ts";

interface Credencial {
  updated_at: string;
  facturapi_org_id: string | null;
  api_key_sandbox_vault_id: string | null;
  api_key_live_vault_id: string | null;
  api_key_sandbox_secret_name: string | null;
  api_key_live_secret_name: string | null;
}

export function errorRpc(error: { code?: string; message?: string }): never {
  if (error.code === "42501") throw new PerfilFiscalError(403, "sin_permiso", "No tienes permiso para administrar este perfil fiscal.");
  if (error.code === "40001") throw new PerfilFiscalError(409, "perfil_cambio", "La configuración o el perfil cambió. Recarga y sincroniza nuevamente.");
  if (error.message?.includes("FECHA_FUTURA")) throw new PerfilFiscalError(422, "fecha_futura", "La fecha de vigencia no puede ser futura.");
  if (error.message?.includes("REQUIERE_REVISION")) throw new PerfilFiscalError(422, "requiere_revision", "Corrige las diferencias fiscales antes de confirmar.");
  throw new PerfilFiscalError(503, "perfil_no_disponible", "No se pudo guardar o consultar el perfil fiscal. Intenta nuevamente.");
}

interface SolicitudSincronizacion {
  orgId: string;
  ambiente: FacturapiAmbiente;
  actor: string;
  version: number;
}

export async function sincronizarPerfil(
  admin: SupabaseClient, { orgId, ambiente, actor, version }: SolicitudSincronizacion,
  consultar = consultarPerfilProveedor,
) {
  const { data: cred, error } = await admin.from("facturapi_credenciales")
    .select("updated_at, facturapi_org_id, api_key_sandbox_vault_id, api_key_live_vault_id, api_key_sandbox_secret_name, api_key_live_secret_name")
    .eq("organization_id", orgId).maybeSingle<Credencial>();
  if (error) errorRpc(error);
  if (!cred) throw new PerfilFiscalError(412, "credenciales_pendientes", "Conecta Facturapi antes de sincronizar los datos fiscales.");
  const resolved = await resolveFacturapiKey({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...cred, ambiente }, error: null }) }) }) }),
    rpc: async (fn, args) => {
      const result = await admin.rpc(fn, args);
      return { data: typeof result.data === "string" ? result.data : null, error: result.error };
    },
  }, orgId);
  if (!resolved.ok) throw new PerfilFiscalError(resolved.data.status, resolved.data.error, resolved.data.message);
  const prefix = ambiente === "live" ? "sk_live_" : "sk_test_";
  if (!resolved.data.apiKey.startsWith(prefix)) {
    throw new PerfilFiscalError(412, "ambiente_discordante", "La llave no corresponde al ambiente seleccionado. Revisa la conexión de Facturapi.");
  }
  const datos = await consultar(resolved.data.apiKey);
  const saved = await admin.rpc("registrar_perfil_fiscal_emisor", {
    p_org_id: orgId, p_ambiente: ambiente, p_actor: actor,
    p_credenciales_actualizadas_at: cred.updated_at, p_version_esperada: version, p_datos: datos,
  });
  if (saved.error) errorRpc(saved.error);
}

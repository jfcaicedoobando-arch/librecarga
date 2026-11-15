import { authenticate, authorizeOrgRole, ROLES_EMISOR_FISCAL } from "../_shared/auth.ts";
import { handlePreflightStrict } from "../_shared/cors.ts";
import { makeJson } from "../_shared/response.ts";
import { captureEdgeException } from "../_shared/sentry.ts";
import { PerfilFiscalError } from "./proveedor.ts";
import { errorRpc, sincronizarPerfil } from "./sincronizar.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function esUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
interface Body {
  organization_id: string;
  ambiente: "sandbox" | "live";
  accion: "consultar" | "sincronizar" | "confirmar";
  perfil_id?: string;
  vigente_desde?: string | null;
}

function esFechaCalendario(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseBody(value: unknown): Body {
  if (!value || typeof value !== "object") throw new PerfilFiscalError(400, "invalid_body", "Solicitud inválida.");
  const b = value as Record<string, unknown>;
  if (!esUuid(b.organization_id)
    || (b.ambiente !== "sandbox" && b.ambiente !== "live")
    || (b.accion !== "consultar" && b.accion !== "sincronizar" && b.accion !== "confirmar")
    || (b.accion === "confirmar" && !esUuid(b.perfil_id))
    || (b.vigente_desde != null && !esFechaCalendario(b.vigente_desde))) {
    throw new PerfilFiscalError(400, "invalid_body", "Revisa la organización, ambiente y datos de la solicitud.");
  }
  return { organization_id: b.organization_id, ambiente: b.ambiente, accion: b.accion,
    perfil_id: typeof b.perfil_id === "string" ? b.perfil_id : undefined,
    vigente_desde: typeof b.vigente_desde === "string" ? b.vigente_desde : null };
}

function versionDe(data: unknown): number {
  if (data && typeof data === "object" && "version" in data && typeof data.version === "number"
    && Number.isInteger(data.version) && data.version >= 0) return data.version;
  throw new PerfilFiscalError(503, "respuesta_invalida", "No se pudo consultar la versión del perfil fiscal.");
}

const defaults = { authenticate, authorizeOrgRole, sincronizarPerfil };

function responderError(error: unknown, json: ReturnType<typeof makeJson>): Response {
  if (error instanceof PerfilFiscalError) return json({ error: error.code, message: error.message }, error.status);
  if (error instanceof SyntaxError) return json({ error: "invalid_body", message: "Solicitud inválida." }, 400);
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("401:")) return json({ error: "unauthorized", message: "Inicia sesión para consultar el perfil fiscal." }, 401);
  const timeout = error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name);
  return json({ error: timeout ? "facturapi_timeout" : "perfil_no_disponible",
    message: timeout ? "Facturapi tardó demasiado. Intenta nuevamente." : "No se pudo consultar el perfil fiscal. Intenta nuevamente." }, timeout ? 504 : 503);
}
export function crearHandler(deps = defaults, reportar = captureEdgeException) {
  return async (req: Request): Promise<Response> => {
    const preflight = handlePreflightStrict(req);
    if (preflight) return preflight;
    const json = makeJson(req);
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    try {
      const auth = await deps.authenticate(req);
      const body = parseBody(await req.json());
      const permitted = await deps.authorizeOrgRole(auth.adminClient, auth.userId, body.organization_id, ROLES_EMISOR_FISCAL);
      if (!permitted) throw new PerfilFiscalError(403, "sin_permiso", "No tienes permiso para administrar este perfil fiscal.");
      const args = { p_org_id: body.organization_id, p_ambiente: body.ambiente };
      // El JWT valida la organización activa antes de consultar credenciales/proveedor.
      const read = () => auth.anonClient.rpc("obtener_perfil_fiscal_emisor", args);
      const current = await read();
      if (current.error) errorRpc(current.error);
      if (body.accion === "consultar") return json(current.data);
      if (body.accion === "sincronizar") {
        await deps.sincronizarPerfil(auth.adminClient, { orgId: body.organization_id,
          ambiente: body.ambiente, actor: auth.userId, version: versionDe(current.data) });
        const result = await read();
        if (result.error) errorRpc(result.error);
        return json(result.data);
      }
      const confirmed = await auth.anonClient.rpc("confirmar_perfil_fiscal_emisor", {
        ...args, p_perfil_id: body.perfil_id, p_vigente_desde: body.vigente_desde,
      });
      if (confirmed.error) errorRpc(confirmed.error);
      return json(confirmed.data);
    } catch (error) {
      const response = responderError(error, json);
      if (response.status >= 500) {
        // Report only the resulting HTTP class, never provider bodies, keys,
        // fiscal data or the original exception/cause.
        await reportar(new Error(`perfil_fiscal_http_${response.status}`), {
          fn: "facturapi-perfil-fiscal", status_code: response.status,
        }).catch(() => undefined);
      }
      return response;
    }
  };
}

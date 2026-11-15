import { basicAuthHeader, FACTURAPI_BASE } from "../_shared/facturapiAuth.ts";

export class PerfilFiscalError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

function objeto(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function texto(value: unknown, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > max) {
    throw new PerfilFiscalError(502, "respuesta_invalida", "Facturapi devolvió datos fiscales inválidos.");
  }
  return value.trim() || null;
}

/** Lista cerrada: nunca persistir certificados, llaves o la respuesta completa. */
export function normalizarPerfilProveedor(value: unknown) {
  const org = objeto(value);
  const id = texto(org.id, 100);
  if (!id) throw new PerfilFiscalError(502, "respuesta_invalida", "Facturapi no devolvió la identidad de la organización.");
  const legal = objeto(org.legal);
  return {
    facturapi_org_id: id,
    rfc: texto(legal.tax_id, 20)?.toUpperCase() ?? null,
    razon_social: texto(legal.legal_name, 300),
    regimen_fiscal: texto(legal.tax_system, 10),
    codigo_postal: texto(objeto(legal.address).zip, 10),
  };
}

/** /me verifica la organización de la llave, incluso si el ID guardado es incorrecto. */
export async function consultarPerfilProveedor(apiKey: string, request: typeof fetch = fetch) {
  const res = await request(`${FACTURAPI_BASE}/organizations/me`, {
    headers: { Authorization: basicAuthHeader(apiKey), Accept: "application/json" },
    signal: AbortSignal.timeout(15_000), redirect: "error",
  });
  if (!res.ok) {
    const auth = res.status === 401 || res.status === 403;
    throw new PerfilFiscalError(auth ? 412 : 502, "facturapi_no_disponible",
      auth ? "Revisa la llave de Facturapi del ambiente seleccionado."
        : "No se pudo consultar Facturapi. Intenta sincronizar nuevamente.");
  }
  try { return normalizarPerfilProveedor(await res.json()); }
  catch (error) {
    if (error instanceof PerfilFiscalError) throw error;
    throw new PerfilFiscalError(502, "respuesta_invalida", "Facturapi devolvió una respuesta inválida.");
  }
}

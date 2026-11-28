/**
 * Helper para reportar errores capturados en `try/catch` manuales a Sentry,
 * enriquecidos automáticamente con contexto ambiental (tenant, route,
 * clasificación del error y payload sanitizado).
 *
 * Uso típico:
 *
 *   try { ... } catch (err) {
 *     toast.error("Algo salió mal");
 *     reportCaughtError(
 *       err,
 *       { feature: "facturacion", op: "set_facturapi_api_key" },
 *       { payload: { ambiente, last4 } },
 *     );
 *   }
 *
 * `reportCaughtError` agrega siempre:
 *   - tags: organization_id, effective_role, route, app_version, error_kind,
 *     pg_code (cuando aplica).
 *   - extra: contexto sanitizado de la operación y request_id.
 *
 * 13.141.8 — auditoría Sentry.
 */
import { classifyError } from "./classifyError";
import { getErrorContext } from "./errorContextStore";
import { sanitizePayload } from "./sanitizePayload";
import { isExpectedTelemetryError } from "./expectedTelemetryError";
import { captureExceptionOnce } from "./captureExceptionOnce";
import { scrubTelemetryData } from "./scrubTelemetryData";

export interface ReportTags {
  /** Dominio funcional. Ejemplos: facturacion, tesoreria, cotizacion, pnl. */
  feature: string;
  /** Operación específica dentro del feature. */
  op?: string;
  /** Otros tags opcionales — convierten a string en Sentry. */
  [key: string]: string | undefined;
}

export interface ReportExtra {
  /** Payload de la operación (args RPC, body del fetch). Se sanitiza. */
  payload?: unknown;
  /** Correlation ID si el backend lo devolvió. */
  requestId?: string;
  /** Cualquier otra metadata libre. */
  [key: string]: unknown;
}


function buildEnrichedTags(
  tags: ReportTags,
  ctx: ReturnType<typeof getErrorContext>,
  classified: ReturnType<typeof classifyError>,
): Record<string, string> {
  const enriched: Record<string, string> = {
    ...(tags as Record<string, string>),
    organization_id: ctx.organizationId ?? "none",
    effective_role: ctx.effectiveRole ?? "none",
    route: ctx.route ?? "unknown",
    app_version: ctx.appVersion,
    error_kind: tags.error_kind ?? classified.kind,
  };
  if (classified.pgCode) enriched.pg_code = classified.pgCode;
  return scrubTelemetryData(enriched) as Record<string, string>;
}

function buildEnrichedExtra(extra: ReportExtra | undefined, dbError: boolean): Record<string, unknown> {
  if (dbError) {
    const id = extra?.requestId;
    return typeof id === "string" && /^[a-f0-9-]{16,64}$/i.test(id) ? { requestId: id } : {};
  }
  const enriched: Record<string, unknown> = { ...(extra ?? {}) };
  if (extra?.payload !== undefined) enriched.payload = sanitizePayload(extra.payload);
  return enriched;
}

export function reportCaughtError(
  err: unknown,
  tags: ReportTags,
  extra?: ReportExtra,
  level?: "warning",
): void {
  const ctx = getErrorContext();
  const rawCause = err instanceof Error ? err.cause : undefined;
  const source = rawCause && typeof rawCause === "object" ? rawCause : err;
  const classified = classifyError(source);

  // Skip: validaciones de negocio esperadas (mem plan Sentry 13.302.7 + 13.308.6).
  // v13.792.1 — defensa en profundidad: cualquier error marcado `expected: true`
  // (p. ej. BuzonDuplicadoError) nunca llega a Sentry aunque otra ruta lo llame.
  const forceReport = (err as { expected?: unknown })?.expected === false ||
    (source as { expected?: unknown })?.expected === false;
  if (!forceReport && (isExpectedTelemetryError(err) || isExpectedTelemetryError(source))) return;

  const enrichedTags = buildEnrichedTags(tags, ctx, classified);
  const enrichedExtra = buildEnrichedExtra(extra, Boolean(classified.pgCode));

  void captureExceptionOnce(err, {
    tags: enrichedTags,
    extra: scrubTelemetryData(enrichedExtra) as typeof enrichedExtra,
    ...(level ? { level } : {}),
  });
}

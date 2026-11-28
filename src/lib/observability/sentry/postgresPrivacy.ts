import type { ErrorEvent } from "@sentry/core";

export function postgresTelemetryCode(error: unknown): string | undefined {
  const value = error as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = value?.code ?? value?.cause?.code;
  return typeof code === "string" && /^(?:[0-9][A-Z0-9]{4}|[A-Z]{1,2}\d[A-Z0-9]{2,3}|PGRST\d{3})$/.test(code)
    ? code
    : undefined;
}

/** Keep the SQLSTATE, correlation ID and frames, excluding text from row-level errors. */
export function scrubPostgresError(event: ErrorEvent, error: unknown): ErrorEvent {
  const code = postgresTelemetryCode(error) ?? postgresTelemetryCode({ code: event.tags?.pg_code });
  if (!code) return event;

  delete event.message;
  for (const value of event.exception?.values ?? []) value.value = `Error de base de datos (${code})`;
  const requestId = event.extra?.requestId;
  event.extra = typeof requestId === "string" && /^[a-f0-9-]{16,64}$/i.test(requestId) ? { requestId } : {};
  delete event.contexts?.["Error"];
  return event;
}

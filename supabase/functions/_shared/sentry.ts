/** Scoped, bounded Sentry reporting for Supabase Edge. No DSN = no-op. */
import { loadSentryEdge } from "./sentryRuntime.ts";
import { applyEdgeContext, cleanEdgeException, type EdgeErrorContext } from "./sentryContext.ts";
import { safePostgresTelemetryError, scrubTelemetryText } from "./scrubTelemetryData.ts";
import { getEdgeScope, runWithEdgeScope } from "./sentryRequestScope.ts";

export type { EdgeErrorContext } from "./sentryContext.ts";
export const scrubExceptionMessage = scrubTelemetryText;

export function initSentryEdge(_fnName: string): void {
  void loadSentryEdge();
}

export function debeReportarStatus(status: number): boolean {
  return status !== 401 && status >= 400;
}

/** Keep the isolate alive while sending telemetry without delaying its HTTP response. */
function deliverTelemetry(sdk: NonNullable<Awaited<ReturnType<typeof loadSentryEdge>>>): Promise<unknown> | void {
  const delivery = sdk.flush(2000).catch(() => undefined);
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(task: Promise<unknown>): void } }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(delivery);
    return;
  }
  return delivery;
}

export async function captureEdgeException(error: unknown, ctx: EdgeErrorContext): Promise<void> {
  const sdk = await loadSentryEdge();
  if (!sdk) return;
  try {
    sdk.withScope(getEdgeScope(), (scope) => {
      const dbError = safePostgresTelemetryError(error);
      applyEdgeContext(scope, dbError ? { ...ctx, extra: undefined } : ctx);
      if (dbError) scope.setTag("pg_code", dbError.code);
      sdk.captureException(dbError ?? cleanEdgeException(error));
    });
    await deliverTelemetry(sdk);
  } catch {
    console.warn("[sentry-edge] capture failed");
  }
}

export async function captureEdgeMessage(
  message: string, level: "info" | "warning" | "error", ctx: EdgeErrorContext,
): Promise<void> {
  const sdk = await loadSentryEdge();
  if (!sdk) return;
  try {
    sdk.withScope(getEdgeScope(), (scope) => {
      applyEdgeContext(scope, ctx);
      scope.setLevel(level);
      sdk.captureMessage(scrubTelemetryText(message));
    });
    await deliverTelemetry(sdk);
  } catch {
    console.warn("[sentry-edge] message capture failed");
  }
}

export function wrapEdgeHandler(
  fnName: string, handler: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  initSentryEdge(fnName);
  return async (req) => {
    const sdk = await loadSentryEdge();
    const requestId = req.headers.get("x-request-id") ?? req.headers.get("x-correlation-id") ?? crypto.randomUUID();
    const run = async () => {
      try { return await handler(req); }
      catch (error) {
        await captureEdgeException(error, { fn: fnName, request_id: requestId });
        throw error;
      }
    };
    if (!sdk) return run();
    // SDK 10 has no async isolation when automatic integrations are disabled.
    // Create the span synchronously, then retain its scope in our own ALS.
    const { scope, span } = sdk.continueTrace({
      sentryTrace: req.headers.get("sentry-trace") ?? undefined,
      baggage: req.headers.get("baggage") ?? undefined,
    }, () => sdk.startSpanManual({ name: fnName, op: "http.server",
      attributes: { "http.request.method": req.method, fn: fnName, request_id: requestId } }, (span) => {
      const scope = sdk.getCurrentScope();
      applyEdgeContext(scope, { fn: fnName, request_id: requestId });
      return { scope: scope.clone(), span };
    }));
    return runWithEdgeScope(scope, async () => {
      try {
        const response = await run();
        span.setAttribute("http.response.status_code", response.status);
        if (response.status >= 500) span.setStatus({ code: 2 });
        return response;
      } catch (error) {
        span.setStatus({ code: 2, message: "internal_error" });
        throw error;
      } finally {
        span.end();
        await deliverTelemetry(sdk);
      }
    });
  };
}

export interface CronMonitorConfig {
  schedule: { type: "crontab"; value: string } | { type: "interval"; value: number; unit: "minute" | "hour" | "day" };
  checkinMargin?: number;
  maxRuntime?: number;
  timezone?: string;
  shouldCheckIn?: (req: Request) => boolean;
}

export function withCronMonitor(
  fnName: string, monitorSlug: string, handler: (req: Request) => Promise<Response> | Response,
  monitorConfig: CronMonitorConfig,
): (req: Request) => Promise<Response> {
  const wrapped = wrapEdgeHandler(fnName, handler);
  const { shouldCheckIn, ...config } = monitorConfig;
  return async (req) => {
    const sdk = await loadSentryEdge();
    const enabled = (Deno.env.get("SENTRY_CRON_MONITOR_SLUG") ??
      "tc-dof-diario,facturapi-reconciliar-cancelaciones").split(",").map((s) => s.trim());
    if (!sdk || !enabled.includes(monitorSlug) || shouldCheckIn?.(req) === false) return wrapped(req);
    const id = sdk.withScope(getEdgeScope(), () =>
      sdk.captureCheckIn({ monitorSlug, status: "in_progress" }, config));
    let status: "ok" | "error" = "error";
    try {
      const response = await wrapped(req);
      status = response.ok ? "ok" : "error";
      return response;
    } finally {
      // Preserve HTTP responses and exceptions; observability does not rewrite the workflow.
      sdk.withScope(getEdgeScope(), () => sdk.captureCheckIn({ checkInId: id, monitorSlug, status }));
      await deliverTelemetry(sdk);
    }
  };
}

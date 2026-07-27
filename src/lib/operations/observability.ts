import { getDatabase } from "@/lib/db/client";
import { recordAuditEvent } from "./audit";
import { recordRouteMetric } from "./metrics";

type ObservabilityOptions = {
  audit?: boolean;
  target?: (request: Request) => string;
};

export function withApiObservability<TRequest extends Request, TArgs extends unknown[]>(
  route: string,
  handler: (request: TRequest, ...args: TArgs) => Promise<Response> | Response,
  options: ObservabilityOptions = {},
) {
  return async (request: TRequest, ...args: TArgs) => {
    const startedAt = performance.now();
    let status = 500;
    let error = "";
    try {
      const response = await handler(request, ...args);
      status = response.status;
      if (status >= 400) error = `HTTP ${status}`;
      response.headers.set("Server-Timing", `app;dur=${Math.round(performance.now() - startedAt)}`);
      return response;
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "Unhandled route error";
      throw caught;
    } finally {
      const durationMs = performance.now() - startedAt;
      recordRouteMetric(route, status, durationMs);
      if (options.audit) {
        try {
          recordAuditEvent(getDatabase(), {
            requestId: request.headers.get("x-request-id") ?? "",
            actor: request.headers.get("x-authenticated-user") ?? "local",
            action: route,
            target: options.target?.(request) ?? new URL(request.url).pathname,
            method: request.method,
            statusCode: status,
            durationMs,
            error,
          });
        } catch (auditError) {
          console.error("operation_audit_failed", {
            route,
            message: auditError instanceof Error ? auditError.message : "unknown",
          });
        }
      }
    }
  };
}

import type Database from "better-sqlite3";

export type AuditEventInput = {
  requestId?: string;
  actor?: string;
  action: string;
  target?: string;
  method?: string;
  statusCode: number;
  durationMs: number;
  error?: string;
  metadata?: Record<string, unknown>;
};

export function recordAuditEvent(db: Database.Database, input: AuditEventInput) {
  db.prepare(
    `
      insert into operation_audit_events (
        request_id, actor, action, target, method, status_code,
        duration_ms, outcome, error, metadata_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    clean(input.requestId, 96),
    clean(input.actor || "local", 96),
    clean(input.action, 120),
    clean(input.target, 240),
    clean(input.method, 12),
    input.statusCode,
    Math.max(0, Math.round(input.durationMs)),
    input.statusCode < 400 ? "success" : "failure",
    clean(input.error, 500),
    JSON.stringify(redactMetadata(input.metadata ?? {})),
  );
}

export function listRecentAuditEvents(db: Database.Database, limit = 50) {
  return db.prepare(
    `
      select
        id,
        request_id as requestId,
        actor,
        action,
        target,
        method,
        status_code as statusCode,
        duration_ms as durationMs,
        outcome,
        error,
        metadata_json as metadataJson,
        created_at as createdAt
      from operation_audit_events
      order by id desc
      limit ?
    `,
  ).all(Math.max(1, Math.min(200, limit)));
}

function redactMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => {
    if (/key|secret|token|password|authorization|cookie/i.test(key)) return [key, "[REDACTED]"];
    if (typeof value === "string") return [key, clean(value, 300)];
    if (typeof value === "number" || typeof value === "boolean" || value === null) return [key, value];
    return [key, "[COMPLEX_VALUE]"];
  }));
}

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/[\r\n\t]/g, " ").slice(0, maxLength) : "";
}

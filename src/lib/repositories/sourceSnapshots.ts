import type Database from "better-sqlite3";

export type SourceSnapshotStatus = "success" | "failed" | "skipped";

export type SourceSnapshotInput = {
  stockCode: string;
  provider: string;
  providerLabel: string;
  status: SourceSnapshotStatus;
  facts?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
  fetchedAt?: string;
  expiresAt?: string;
};

export type SourceSnapshot = {
  stockCode: string;
  provider: string;
  providerLabel: string;
  status: SourceSnapshotStatus;
  facts: Record<string, unknown>;
  error: string;
  durationMs: number;
  fetchedAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

type SourceSnapshotRow = Omit<SourceSnapshot, "facts"> & {
  factsJson: string;
};

export function upsertSourceSnapshot(db: Database.Database, snapshot: SourceSnapshotInput) {
  db.prepare(
    `
      insert into company_source_snapshots (
        stock_code,
        provider,
        provider_label,
        status,
        facts_json,
        error,
        duration_ms,
        fetched_at,
        expires_at
      )
      values (
        @stockCode,
        @provider,
        @providerLabel,
        @status,
        @factsJson,
        @error,
        @durationMs,
        coalesce(nullif(@fetchedAt, ''), current_timestamp),
        @expiresAt
      )
      on conflict(stock_code, provider) do update set
        provider_label = excluded.provider_label,
        status = excluded.status,
        facts_json = excluded.facts_json,
        error = excluded.error,
        duration_ms = excluded.duration_ms,
        fetched_at = excluded.fetched_at,
        expires_at = excluded.expires_at,
        updated_at = current_timestamp
    `,
  ).run({
    stockCode: snapshot.stockCode,
    provider: snapshot.provider,
    providerLabel: snapshot.providerLabel,
    status: snapshot.status,
    factsJson: JSON.stringify(snapshot.facts ?? {}),
    error: snapshot.error ?? "",
    durationMs: Math.max(0, Math.round(snapshot.durationMs ?? 0)),
    fetchedAt: snapshot.fetchedAt ?? "",
    expiresAt: snapshot.expiresAt ?? "",
  });
}

export function listSourceSnapshots(db: Database.Database, stockCode: string) {
  const rows = db
    .prepare(
      `
        select
          stock_code as stockCode,
          provider,
          provider_label as providerLabel,
          status,
          facts_json as factsJson,
          error,
          duration_ms as durationMs,
          fetched_at as fetchedAt,
          expires_at as expiresAt,
          created_at as createdAt,
          updated_at as updatedAt
        from company_source_snapshots
        where stock_code = ?
        order by
          case status when 'success' then 0 when 'failed' then 1 else 2 end,
          provider asc
      `,
    )
    .all(stockCode) as SourceSnapshotRow[];

  return rows.map(mapSourceSnapshot);
}

export function getFreshSourceSnapshot(db: Database.Database, stockCode: string, provider: string, now = new Date()) {
  const row = db
    .prepare(
      `
        select
          stock_code as stockCode,
          provider,
          provider_label as providerLabel,
          status,
          facts_json as factsJson,
          error,
          duration_ms as durationMs,
          fetched_at as fetchedAt,
          expires_at as expiresAt,
          created_at as createdAt,
          updated_at as updatedAt
        from company_source_snapshots
        where stock_code = ?
          and provider = ?
          and status = 'success'
          and (expires_at = '' or expires_at > ?)
        limit 1
      `,
    )
    .get(stockCode, provider, toSqliteTimestamp(now)) as SourceSnapshotRow | undefined;

  return row ? mapSourceSnapshot(row) : null;
}

function mapSourceSnapshot(row: SourceSnapshotRow): SourceSnapshot {
  return {
    ...row,
    facts: parseFacts(row.factsJson),
  };
}

function parseFacts(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toSqliteTimestamp(value: Date) {
  return value.toISOString().replace("T", " ").slice(0, 19);
}

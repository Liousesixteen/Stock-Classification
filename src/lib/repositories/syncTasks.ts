import type Database from "better-sqlite3";

export type SyncTaskStatus = "pending" | "running" | "partial" | "success" | "failed";

export type SyncTaskInput = {
  stockCode: string;
  taskType: string;
  source: string;
  status: SyncTaskStatus;
  message: string;
  error?: string;
  progress?: number;
  maxAttempts?: number;
  nextAttemptAt?: string;
  leaseExpiresAt?: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
};

export type SyncTaskUpdate = {
  status: SyncTaskStatus;
  message: string;
  error?: string;
  progress?: number;
};

export type SyncTask = {
  id: number;
  stockCode: string;
  taskType: string;
  source: string;
  status: SyncTaskStatus;
  message: string;
  error: string;
  progress: number;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  leaseExpiresAt: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
  updatedAt: string;
};

export function createSyncTask(db: Database.Database, task: SyncTaskInput) {
  const result = db
    .prepare(
      `
        insert into sync_tasks (
          stock_code,
          task_type,
          source,
          status,
          message,
          error,
          progress,
          attempt_count,
          max_attempts,
          next_attempt_at,
          lease_expires_at,
          idempotency_key,
          payload_json,
          started_at,
          finished_at
        )
        values (
          @stockCode,
          @taskType,
          @source,
          @status,
          @message,
          @error,
          @progress,
          0,
          @maxAttempts,
          @nextAttemptAt,
          @leaseExpiresAt,
          @idempotencyKey,
          @payloadJson,
          case when @status = 'running' then current_timestamp else '' end,
          case when @status in ('partial', 'success', 'failed') then current_timestamp else '' end
        )
      `,
    )
    .run({
      stockCode: task.stockCode,
      taskType: task.taskType,
      source: task.source,
      status: task.status,
      message: task.message,
      error: task.error ?? "",
      progress: clampProgress(task.progress ?? 0),
      maxAttempts: Math.max(1, Math.round(task.maxAttempts ?? 3)),
      nextAttemptAt: task.nextAttemptAt ?? "",
      leaseExpiresAt: task.leaseExpiresAt ?? "",
      idempotencyKey: task.idempotencyKey ?? "",
      payloadJson: JSON.stringify(task.payload ?? {}),
    });

  return Number(result.lastInsertRowid);
}

export function updateSyncTask(db: Database.Database, taskId: number, update: SyncTaskUpdate) {
  db.prepare(
    `
      update sync_tasks
      set status = @status,
          message = @message,
          error = @error,
          progress = coalesce(@progress, progress),
          started_at = case
            when started_at = '' and @status = 'running' then current_timestamp
            else started_at
          end,
          finished_at = case
            when @status in ('partial', 'success', 'failed') then current_timestamp
            else finished_at
          end,
          lease_expires_at = case
            when @status in ('partial', 'success', 'failed') then ''
            else lease_expires_at
          end,
          updated_at = current_timestamp
      where id = @taskId
    `,
  ).run({
    taskId,
    status: update.status,
    message: update.message,
    error: update.error ?? "",
    progress: update.progress === undefined ? null : clampProgress(update.progress),
  });
}

export function listSyncTasksForStock(db: Database.Database, stockCode: string) {
  const rows = db
    .prepare(
      `
        select
          id,
          stock_code as stockCode,
          task_type as taskType,
          source,
          status,
          message,
          error,
          progress,
          attempt_count as attemptCount,
          max_attempts as maxAttempts,
          next_attempt_at as nextAttemptAt,
          lease_expires_at as leaseExpiresAt,
          idempotency_key as idempotencyKey,
          payload_json as payloadJson,
          started_at as startedAt,
          finished_at as finishedAt,
          created_at as createdAt,
          updated_at as updatedAt
        from sync_tasks
        where stock_code = ?
        order by id desc
      `,
    )
    .all(stockCode) as SyncTaskRow[];

  return rows.map(mapSyncTask);
}

export function getSyncTaskById(db: Database.Database, taskId: number) {
  const row = db
    .prepare(
      `
        select
          id,
          stock_code as stockCode,
          task_type as taskType,
          source,
          status,
          message,
          error,
          progress,
          attempt_count as attemptCount,
          max_attempts as maxAttempts,
          next_attempt_at as nextAttemptAt,
          lease_expires_at as leaseExpiresAt,
          idempotency_key as idempotencyKey,
          payload_json as payloadJson,
          started_at as startedAt,
          finished_at as finishedAt,
          created_at as createdAt,
          updated_at as updatedAt
        from sync_tasks
        where id = ?
        limit 1
      `,
    )
    .get(taskId) as SyncTaskRow | undefined;

  return row ? mapSyncTask(row) : null;
}

export function getLatestSyncTaskForStock(db: Database.Database, stockCode: string, taskType: string) {
  const row = db
    .prepare(
      `
        select
          id,
          stock_code as stockCode,
          task_type as taskType,
          source,
          status,
          message,
          error,
          progress,
          attempt_count as attemptCount,
          max_attempts as maxAttempts,
          next_attempt_at as nextAttemptAt,
          lease_expires_at as leaseExpiresAt,
          idempotency_key as idempotencyKey,
          payload_json as payloadJson,
          started_at as startedAt,
          finished_at as finishedAt,
          created_at as createdAt,
          updated_at as updatedAt
        from sync_tasks
        where stock_code = ? and task_type = ?
        order by id desc
        limit 1
      `,
    )
    .get(stockCode, taskType) as SyncTaskRow | undefined;

  return row ? mapSyncTask(row) : null;
}

export function getSyncTaskByIdempotencyKey(db: Database.Database, idempotencyKey: string) {
  if (!idempotencyKey) return null;
  const row = db
    .prepare(
      `
        select
          id,
          stock_code as stockCode,
          task_type as taskType,
          source,
          status,
          message,
          error,
          progress,
          attempt_count as attemptCount,
          max_attempts as maxAttempts,
          next_attempt_at as nextAttemptAt,
          lease_expires_at as leaseExpiresAt,
          idempotency_key as idempotencyKey,
          payload_json as payloadJson,
          started_at as startedAt,
          finished_at as finishedAt,
          created_at as createdAt,
          updated_at as updatedAt
        from sync_tasks
        where idempotency_key = ?
        limit 1
      `,
    )
    .get(idempotencyKey) as SyncTaskRow | undefined;
  return row ? mapSyncTask(row) : null;
}

export function listRunnableSyncTaskIds(
  db: Database.Database,
  input?: { now?: Date; limit?: number },
) {
  const now = toSqliteTimestamp(input?.now ?? new Date());
  const limit = Math.max(1, Math.min(Math.round(input?.limit ?? 10), 100));
  const rows = db
    .prepare(
      `
        select id
        from sync_tasks
        where (
          status = 'pending'
          and attempt_count < max_attempts
          and (next_attempt_at = '' or next_attempt_at <= @now)
        ) or (
          status = 'running'
          and lease_expires_at != ''
          and lease_expires_at <= @now
          and attempt_count < max_attempts
        )
        order by
          case when status = 'running' then 0 else 1 end,
          id asc
        limit @limit
      `,
    )
    .all({ now, limit }) as Array<{ id: number }>;
  return rows.map((row) => row.id);
}

export function claimSyncTask(db: Database.Database, taskId: number, input?: { now?: Date; leaseMs?: number }) {
  const current = input?.now ?? new Date();
  const now = toSqliteTimestamp(current);
  const leaseExpiresAt = toSqliteTimestamp(new Date(current.getTime() + Math.max(1_000, input?.leaseMs ?? 60_000)));

  return db.transaction(() => {
    db.prepare(
      `
        update sync_tasks
        set status = 'pending',
            message = '检测到中断任务，等待恢复',
            lease_expires_at = '',
            updated_at = current_timestamp
        where id = ?
          and status = 'running'
          and lease_expires_at != ''
          and lease_expires_at <= ?
      `,
    ).run(taskId, now);

    const result = db
      .prepare(
        `
          update sync_tasks
          set status = 'running',
              message = case when message = '' then '正在同步' else message end,
              progress = max(progress, 1),
              attempt_count = attempt_count + 1,
              lease_expires_at = ?,
              started_at = case when started_at = '' then current_timestamp else started_at end,
              finished_at = '',
              updated_at = current_timestamp
          where id = ?
            and status = 'pending'
            and attempt_count < max_attempts
            and (next_attempt_at = '' or next_attempt_at <= ?)
        `,
      )
      .run(leaseExpiresAt, taskId, now);

    return result.changes === 1 ? getSyncTaskById(db, taskId) : null;
  })();
}

export function renewSyncTaskLease(
  db: Database.Database,
  taskId: number,
  input?: { now?: Date; leaseMs?: number; progress?: number; message?: string },
) {
  const current = input?.now ?? new Date();
  const leaseExpiresAt = toSqliteTimestamp(new Date(current.getTime() + Math.max(1_000, input?.leaseMs ?? 60_000)));
  db.prepare(
    `
      update sync_tasks
      set lease_expires_at = @leaseExpiresAt,
          progress = coalesce(@progress, progress),
          message = coalesce(@message, message),
          updated_at = current_timestamp
      where id = @taskId and status = 'running'
    `,
  ).run({
    taskId,
    leaseExpiresAt,
    progress: input?.progress === undefined ? null : clampProgress(input.progress),
    message: input?.message ?? null,
  });
}

export function requeueSyncTask(
  db: Database.Database,
  taskId: number,
  input: { message: string; error: string; nextAttemptAt?: string },
) {
  db.prepare(
    `
      update sync_tasks
      set status = case when attempt_count < max_attempts then 'pending' else 'failed' end,
          message = case when attempt_count < max_attempts then @message else '资料补全失败，已达到重试上限' end,
          error = @error,
          progress = case when attempt_count < max_attempts then min(progress, 90) else progress end,
          next_attempt_at = case when attempt_count < max_attempts then @nextAttemptAt else next_attempt_at end,
          lease_expires_at = '',
          finished_at = case when attempt_count < max_attempts then '' else current_timestamp end,
          updated_at = current_timestamp
      where id = @taskId
    `,
  ).run({
    taskId,
    message: input.message,
    error: input.error,
    nextAttemptAt: input.nextAttemptAt ?? "",
  });
  return getSyncTaskById(db, taskId);
}

type SyncTaskRow = Omit<SyncTask, "payload"> & { payloadJson: string };

function mapSyncTask(row: SyncTaskRow): SyncTask {
  const { payloadJson, ...task } = row;
  return { ...task, payload: parsePayload(payloadJson) };
}

function parsePayload(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toSqliteTimestamp(value: Date) {
  return value.toISOString().replace("T", " ").slice(0, 19);
}

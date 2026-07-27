import type Database from "better-sqlite3";
import { getDatabase } from "@/lib/db/client";
import { COMPANY_PROFILE_SYNC_TASK_TYPE, runCompanyProfileSync } from "@/lib/research/companyProfileSync";
import {
  claimSyncTask,
  getSyncTaskById,
  requeueSyncTask,
  renewSyncTaskLease,
  type SyncTask,
} from "@/lib/repositories/syncTasks";

type WorkerDependencies = {
  db?: Database.Database;
  runCompanySync?: typeof runCompanyProfileSync;
  now?: () => Date;
};

export async function runSyncTaskWithRetries(taskId: number, dependencies: WorkerDependencies = {}) {
  const db = dependencies.db ?? getDatabase();
  const runCompanySync = dependencies.runCompanySync ?? runCompanyProfileSync;
  const now = dependencies.now ?? (() => new Date());
  const task = claimSyncTask(db, taskId, { now: now(), leaseMs: 60_000 });
  if (!task) return getSyncTaskById(db, taskId);

  try {
    if (task.taskType !== COMPANY_PROFILE_SYNC_TASK_TYPE) {
      throw new Error(`暂不支持的同步任务类型：${task.taskType}`);
    }

    renewSyncTaskLease(db, task.id, {
      now: now(),
      leaseMs: 60_000,
      progress: 5,
      message: task.attemptCount > 1 ? `正在进行第 ${task.attemptCount} 次同步` : "正在同步公司资料",
    });
    const result = await runCompanySync({
      stockCode: task.stockCode,
      categoryId: readOptionalPositiveInteger(task.payload.categoryId),
      taskId: task.id,
      force: task.payload.force === true || task.attemptCount > 1,
    });
    if (result.partial && task.attemptCount < task.maxAttempts) {
      const retryDelayMs = partialRetryDelayMs();
      const failedProviders = result.failedProviders.length > 0
        ? result.failedProviders.join("、")
        : "部分数据源";
      return requeueSyncTask(db, task.id, {
        message: `${failedProviders}暂不可用，已保留现有结果并等待自动补偿`,
        error: `${failedProviders}同步失败`,
        nextAttemptAt: toSqliteTimestamp(new Date(now().getTime() + retryDelayMs)),
      });
    }
    return getSyncTaskById(db, task.id);
  } catch (error) {
    const failedTask = getSyncTaskById(db, task.id);
    const message = error instanceof Error ? error.message : "公司资料同步失败";
    const retryDelayMs = calculateRetryDelayMs(failedTask ?? task);
    return requeueSyncTask(db, task.id, {
      message: `同步失败，将自动进行第 ${task.attemptCount + 1} 次尝试`,
      error: message,
      nextAttemptAt: toSqliteTimestamp(new Date(now().getTime() + retryDelayMs)),
    });
  }
}

function calculateRetryDelayMs(task: SyncTask) {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, task.attemptCount - 1));
}

function readOptionalPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function partialRetryDelayMs() {
  const configured = Number(process.env.STOCK_SYNC_PARTIAL_RETRY_MS);
  return Number.isInteger(configured) && configured >= 1_000 ? configured : 60_000;
}

function toSqliteTimestamp(value: Date) {
  return value.toISOString().replace("T", " ").slice(0, 19);
}

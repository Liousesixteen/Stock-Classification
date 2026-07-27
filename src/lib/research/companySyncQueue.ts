import type Database from "better-sqlite3";
import { COMPANY_PROFILE_SYNC_TASK_TYPE } from "./companyProfileSync";
import {
  createSyncTask,
  getLatestSyncTaskForStock,
  getSyncTaskById,
  getSyncTaskByIdempotencyKey,
  type SyncTask,
} from "@/lib/repositories/syncTasks";

export type EnqueueCompanySyncInput = {
  stockCode: string;
  categoryId?: number;
  force?: boolean;
  now?: Date;
};

export type EnqueueCompanySyncResult = {
  task: SyncTask;
  deduplicated: boolean;
};

export function enqueueCompanyProfileSyncTask(
  db: Database.Database,
  input: EnqueueCompanySyncInput,
): EnqueueCompanySyncResult {
  const force = input.force === true;
  const latestTask = getLatestSyncTaskForStock(db, input.stockCode, COMPANY_PROFILE_SYNC_TASK_TYPE);
  if (!force && latestTask && isActiveCompatibleTask(latestTask, input.categoryId)) {
    return { task: latestTask, deduplicated: true };
  }

  const idempotencyKey = buildCompanyProfileSyncIdempotencyKey(input);
  const reusableTask = getSyncTaskByIdempotencyKey(db, idempotencyKey);
  if (!force && reusableTask) {
    return { task: reusableTask, deduplicated: true };
  }

  const taskId = createSyncTask(db, {
    stockCode: input.stockCode,
    taskType: COMPANY_PROFILE_SYNC_TASK_TYPE,
    source: "provider-pipeline",
    status: "pending",
    message: "已保存，等待后台补全资料",
    progress: 0,
    maxAttempts: 3,
    idempotencyKey,
    payload: {
      categoryId: input.categoryId,
      force,
    },
  });
  const task = getSyncTaskById(db, taskId);
  if (!task) throw new Error("同步任务创建失败");
  return { task, deduplicated: false };
}

export function buildCompanyProfileSyncIdempotencyKey(input: EnqueueCompanySyncInput) {
  const scope = input.categoryId ?? "all";
  if (input.force) {
    return `${COMPANY_PROFILE_SYNC_TASK_TYPE}:${input.stockCode}:${scope}:force:${(input.now ?? new Date()).getTime()}`;
  }
  const sixHourBucket = Math.floor((input.now ?? new Date()).getTime() / (6 * 60 * 60 * 1000));
  return `${COMPANY_PROFILE_SYNC_TASK_TYPE}:${input.stockCode}:${scope}:${sixHourBucket}`;
}

function isActiveCompatibleTask(task: SyncTask, categoryId: number | undefined) {
  if (task.status !== "pending" && task.status !== "running") return false;
  const taskCategoryId = readOptionalPositiveInteger(task.payload.categoryId);
  return taskCategoryId === undefined || taskCategoryId === categoryId;
}

function readOptionalPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

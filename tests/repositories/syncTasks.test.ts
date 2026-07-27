import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { upsertCompany } from "@/lib/repositories/companies";
import {
  claimSyncTask,
  createSyncTask,
  getSyncTaskById,
  getSyncTaskByIdempotencyKey,
  listRunnableSyncTaskIds,
  requeueSyncTask,
} from "@/lib/repositories/syncTasks";

function setupDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  upsertCompany(db, {
    stockCode: "300346",
    shortName: "南大光电",
    fullName: "",
    board: "创业板",
    industry: "",
    region: "",
    marketCapBand: "",
    intro: "",
    mainBusiness: "",
    updatedAt: "",
  });
  return db;
}

describe("sync task queue", () => {
  it("persists payload and claims a queued task only once", () => {
    const db = setupDb();
    const taskId = createSyncTask(db, {
      stockCode: "300346",
      taskType: "company_research_profile",
      source: "provider-pipeline",
      status: "pending",
      message: "等待同步",
      idempotencyKey: "company-profile:300346:1",
      payload: { categoryId: 7, force: false },
    });

    expect(getSyncTaskByIdempotencyKey(db, "company-profile:300346:1")).toMatchObject({
      id: taskId,
      payload: { categoryId: 7, force: false },
      progress: 0,
      attemptCount: 0,
      maxAttempts: 3,
    });
    expect(claimSyncTask(db, taskId, { now: new Date("2026-07-26T02:00:00.000Z") })).toMatchObject({
      status: "running",
      attemptCount: 1,
      progress: 1,
    });
    expect(claimSyncTask(db, taskId, { now: new Date("2026-07-26T02:00:01.000Z") })).toBeNull();
  });

  it("recovers an expired lease and stops retrying at the configured limit", () => {
    const db = setupDb();
    const taskId = createSyncTask(db, {
      stockCode: "300346",
      taskType: "company_research_profile",
      source: "provider-pipeline",
      status: "pending",
      message: "等待同步",
      maxAttempts: 2,
    });

    claimSyncTask(db, taskId, { now: new Date("2026-07-26T02:00:00.000Z"), leaseMs: 1_000 });
    expect(claimSyncTask(db, taskId, { now: new Date("2026-07-26T02:00:02.000Z"), leaseMs: 1_000 })).toMatchObject({
      status: "running",
      attemptCount: 2,
      message: "检测到中断任务，等待恢复",
    });

    expect(
      requeueSyncTask(db, taskId, {
        message: "准备重试",
        error: "上游超时",
      }),
    ).toMatchObject({
      status: "failed",
      attemptCount: 2,
      error: "上游超时",
    });
    expect(getSyncTaskById(db, taskId)?.finishedAt).not.toBe("");
  });

  it("lists due queued tasks and expired leases for restart recovery", () => {
    const db = setupDb();
    const dueTaskId = createSyncTask(db, {
      stockCode: "300346",
      taskType: "company_research_profile",
      source: "provider-pipeline",
      status: "pending",
      message: "等待同步",
      nextAttemptAt: "2026-07-26 01:59:59",
    });
    createSyncTask(db, {
      stockCode: "300346",
      taskType: "company_research_profile",
      source: "provider-pipeline",
      status: "pending",
      message: "稍后同步",
      nextAttemptAt: "2026-07-26 02:10:00",
    });
    const expiredTaskId = createSyncTask(db, {
      stockCode: "300346",
      taskType: "company_research_profile",
      source: "provider-pipeline",
      status: "pending",
      message: "运行后中断",
    });
    claimSyncTask(db, expiredTaskId, {
      now: new Date("2026-07-26T01:59:00.000Z"),
      leaseMs: 1_000,
    });

    expect(
      listRunnableSyncTaskIds(db, {
        now: new Date("2026-07-26T02:00:00.000Z"),
      }),
    ).toEqual([expiredTaskId, dueTaskId]);
  });
});

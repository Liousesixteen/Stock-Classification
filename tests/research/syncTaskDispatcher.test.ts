import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { migrate } from "@/lib/db/schema";
import { upsertCompany } from "@/lib/repositories/companies";
import { claimSyncTask, createSyncTask } from "@/lib/repositories/syncTasks";
import { SyncTaskDispatcher } from "@/lib/research/syncTaskDispatcher";

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

function createPendingTask(db: Database.Database) {
  return createSyncTask(db, {
    stockCode: "300346",
    taskType: "company_research_profile",
    source: "provider-pipeline",
    status: "pending",
    message: "等待同步",
  });
}

describe("sync task dispatcher", () => {
  it("respects concurrency and dispatches remaining tasks when capacity returns", async () => {
    const db = setupDb();
    const taskIds = [createPendingTask(db), createPendingTask(db), createPendingTask(db)];
    const resolvers = new Map<number, () => void>();
    const runTask = vi.fn(
      (taskId: number) => {
        claimSyncTask(db, taskId, {
          now: new Date("2026-07-26T02:00:00.000Z"),
          leaseMs: 60_000,
        });
        return new Promise<void>((resolve) => {
          resolvers.set(taskId, resolve);
        });
      },
    );
    const dispatcher = new SyncTaskDispatcher(
      { concurrency: 2 },
      {
        db,
        runTask,
        now: () => new Date("2026-07-26T02:00:00.000Z"),
      },
    );

    expect(await dispatcher.tick()).toEqual(taskIds.slice(0, 2));
    expect(dispatcher.getActiveTaskIds()).toEqual(taskIds.slice(0, 2));
    expect(await dispatcher.tick()).toEqual([]);

    resolvers.get(taskIds[0])?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(await dispatcher.tick()).toEqual([taskIds[2]]);
  });

  it("recovers an expired running task after a simulated process restart", async () => {
    const db = setupDb();
    const taskId = createPendingTask(db);
    claimSyncTask(db, taskId, {
      now: new Date("2026-07-26T02:00:00.000Z"),
      leaseMs: 1_000,
    });
    const runTask = vi.fn(async () => undefined);
    const restartedDispatcher = new SyncTaskDispatcher(
      { concurrency: 1 },
      {
        db,
        runTask,
        now: () => new Date("2026-07-26T02:00:02.000Z"),
      },
    );

    expect(await restartedDispatcher.tick()).toEqual([taskId]);
    expect(runTask).toHaveBeenCalledWith(taskId);
  });
});

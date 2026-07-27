import Database from "better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { migrate } from "@/lib/db/schema";
import { runSyncTaskWithRetries } from "@/lib/research/syncTaskWorker";
import { upsertCompany } from "@/lib/repositories/companies";
import { createSyncTask, updateSyncTask } from "@/lib/repositories/syncTasks";

describe("sync task worker", () => {
  it("retries with persisted attempts and completes the task", async () => {
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
    const taskId = createSyncTask(db, {
      stockCode: "300346",
      taskType: "company_research_profile",
      source: "provider-pipeline",
      status: "pending",
      message: "等待同步",
      maxAttempts: 3,
      payload: { categoryId: 7 },
    });
    let currentMs = new Date("2026-07-26T02:00:00.000Z").getTime();
    const runCompanySync = vi.fn(async (input: { taskId: number }) => {
      if (runCompanySync.mock.calls.length < 3) throw new Error("临时上游故障");
      updateSyncTask(db, input.taskId, {
        status: "success",
        message: "资料补全完成",
        progress: 100,
      });
      return {
        stockCode: "300346",
        relationCount: 1,
        fromCache: false,
        partial: false,
        failedProviders: [],
      };
    });

    const dependencies = {
      db,
      runCompanySync,
      now: () => new Date(currentMs),
    };
    expect(await runSyncTaskWithRetries(taskId, dependencies)).toMatchObject({
      status: "pending",
      attemptCount: 1,
    });
    currentMs += 1_000;
    expect(await runSyncTaskWithRetries(taskId, dependencies)).toMatchObject({
      status: "pending",
      attemptCount: 2,
    });
    currentMs += 2_000;
    const result = await runSyncTaskWithRetries(taskId, dependencies);

    expect(runCompanySync).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      status: "success",
      progress: 100,
      attemptCount: 3,
      payload: { categoryId: 7 },
    });
  });

  it("requeues partial results and bypasses aggregate cache on the compensation attempt", async () => {
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
    const taskId = createSyncTask(db, {
      stockCode: "300346",
      taskType: "company_research_profile",
      source: "provider-pipeline",
      status: "pending",
      message: "等待同步",
      maxAttempts: 3,
    });
    let currentMs = new Date("2026-07-26T02:00:00.000Z").getTime();
    const runCompanySync = vi.fn(async (input: { taskId: number; force?: boolean }) => {
      if (runCompanySync.mock.calls.length === 1) {
        updateSyncTask(db, input.taskId, {
          status: "partial",
          message: "部分完成",
          progress: 100,
        });
        return {
          stockCode: "300346",
          relationCount: 1,
          fromCache: false,
          partial: true,
          failedProviders: ["sina_cash_flow"],
        };
      }
      updateSyncTask(db, input.taskId, {
        status: "success",
        message: "补偿完成",
        progress: 100,
      });
      return {
        stockCode: "300346",
        relationCount: 1,
        fromCache: false,
        partial: false,
        failedProviders: [],
      };
    });
    const dependencies = {
      db,
      runCompanySync,
      now: () => new Date(currentMs),
    };

    expect(await runSyncTaskWithRetries(taskId, dependencies)).toMatchObject({
      status: "pending",
      progress: 90,
      attemptCount: 1,
      error: "sina_cash_flow同步失败",
    });
    currentMs += 60_000;
    expect(await runSyncTaskWithRetries(taskId, dependencies)).toMatchObject({
      status: "success",
      attemptCount: 2,
    });
    expect(runCompanySync.mock.calls[0]?.[0]).toMatchObject({ force: false });
    expect(runCompanySync.mock.calls[1]?.[0]).toMatchObject({ force: true });
  });
});

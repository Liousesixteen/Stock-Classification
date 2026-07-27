import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enqueueCompanyProfileSync,
  pollCompanyProfileSync,
} from "@/components/workbench/companySyncClient";
import type { SyncTask } from "@/lib/repositories/syncTasks";

function task(status: SyncTask["status"], overrides: Partial<SyncTask> = {}): SyncTask {
  return {
    id: 42,
    stockCode: "600584",
    taskType: "company_research_profile",
    source: "eastmoney+baidu+agent",
    status,
    message: status === "success" ? "资料补全完成" : "正在补全资料",
    error: "",
    progress: status === "success" ? 100 : 10,
    attemptCount: 1,
    maxAttempts: 3,
    nextAttemptAt: "",
    leaseExpiresAt: "",
    idempotencyKey: "",
    payload: {},
    startedAt: "",
    finishedAt: "",
    createdAt: "2026-07-25 10:00:00",
    updatedAt: "2026-07-25 10:00:00",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("company sync client", () => {
  it("enqueues a server-owned profile sync task", async () => {
    const queued = task("pending");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ task: queued }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(enqueueCompanyProfileSync("600584", { categoryId: 7 })).resolves.toEqual(queued);
    expect(fetchMock).toHaveBeenCalledWith("/api/companies/600584/sync", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ categoryId: 7 }),
    }));
  });

  it("polls through running state until the task succeeds", async () => {
    const running = task("running");
    const completed = task("success");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        latestSyncTask: running,
        syncTasks: [running],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        latestSyncTask: completed,
        syncTasks: [completed],
      }), { status: 200 }));
    const onSnapshot = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(pollCompanyProfileSync("600584", 42, {
      attempts: 2,
      intervalMs: 0,
      onSnapshot,
    })).resolves.toEqual(completed);
    expect(onSnapshot).toHaveBeenNthCalledWith(1, running, expect.any(Object));
    expect(onSnapshot).toHaveBeenNthCalledWith(2, completed, expect.any(Object));
  });

  it("returns failed tasks so the interface can offer a retry", async () => {
    const failed = task("failed", {
      message: "资料补全失败，可重试",
      error: "上游超时",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        latestSyncTask: failed,
        syncTasks: [failed],
      }), { status: 200 }),
    ));

    await expect(pollCompanyProfileSync("600584", 42, {
      attempts: 1,
      intervalMs: 0,
    })).resolves.toEqual(failed);
  });

  it("returns the latest running task when polling ends so the interface keeps a syncing state", async () => {
    const running = task("running", {
      message: "基础资料已可用，深度资料仍在后台整理",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        latestSyncTask: running,
        syncTasks: [running],
      }), { status: 200 }),
    ));

    await expect(pollCompanyProfileSync("600584", 42, {
      attempts: 1,
      intervalMs: 0,
    })).resolves.toEqual(running);
  });
});

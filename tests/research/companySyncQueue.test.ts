import { performance } from "node:perf_hooks";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { upsertCompany } from "@/lib/repositories/companies";
import {
  buildCompanyProfileSyncIdempotencyKey,
  enqueueCompanyProfileSyncTask,
} from "@/lib/research/companySyncQueue";

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

describe("company sync queue", () => {
  it("persists a reusable task within the save-response latency budget", () => {
    const db = setupDb();
    const now = new Date("2026-07-26T06:00:00.000Z");
    const startedAt = performance.now();
    const first = enqueueCompanyProfileSyncTask(db, {
      stockCode: "300346",
      categoryId: 7,
      now,
    });
    const durationMs = performance.now() - startedAt;
    const second = enqueueCompanyProfileSyncTask(db, {
      stockCode: "300346",
      categoryId: 7,
      now,
    });

    expect(first.task).toMatchObject({
      stockCode: "300346",
      status: "pending",
      payload: { categoryId: 7, force: false },
    });
    expect(second).toMatchObject({
      deduplicated: true,
      task: { id: first.task.id },
    });
    expect(durationMs).toBeLessThan(300);
  });

  it("does not reuse a category-scoped active task for another category", () => {
    const db = setupDb();
    const now = new Date("2026-07-26T06:00:00.000Z");
    const first = enqueueCompanyProfileSyncTask(db, {
      stockCode: "300346",
      categoryId: 7,
      now,
    });
    const second = enqueueCompanyProfileSyncTask(db, {
      stockCode: "300346",
      categoryId: 8,
      now,
    });

    expect(second.task.id).not.toBe(first.task.id);
    expect(second.deduplicated).toBe(false);
  });

  it("builds stable six-hour keys and unique force keys", () => {
    const now = new Date("2026-07-26T06:00:00.000Z");
    expect(
      buildCompanyProfileSyncIdempotencyKey({
        stockCode: "300346",
        categoryId: 7,
        now,
      }),
    ).toBe(
      buildCompanyProfileSyncIdempotencyKey({
        stockCode: "300346",
        categoryId: 7,
        now: new Date("2026-07-26T07:00:00.000Z"),
      }),
    );
    expect(
      buildCompanyProfileSyncIdempotencyKey({
        stockCode: "300346",
        categoryId: 7,
        force: true,
        now,
      }),
    ).toContain(":force:");
  });
});

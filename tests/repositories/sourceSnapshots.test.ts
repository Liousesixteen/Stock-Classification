import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { upsertCompany } from "@/lib/repositories/companies";
import {
  getFreshSourceSnapshot,
  listSourceSnapshots,
  upsertSourceSnapshot,
} from "@/lib/repositories/sourceSnapshots";

function setupDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  upsertCompany(db, {
    stockCode: "300346",
    shortName: "南大光电",
    fullName: "江苏南大光电材料股份有限公司",
    board: "创业板",
    industry: "电子化学品",
    region: "江苏",
    marketCapBand: "100-300亿",
    intro: "",
    mainBusiness: "",
    updatedAt: "",
  });
  return db;
}

describe("source snapshot repositories", () => {
  it("stores structured source facts and returns a fresh successful snapshot", () => {
    const db = setupDb();

    upsertSourceSnapshot(db, {
      stockCode: "300346",
      provider: "eastmoney_push2",
      providerLabel: "东方财富基础资料",
      status: "success",
      facts: {
        shortName: "南大光电",
        industry: "电子化学品",
        concepts: ["光刻胶", "半导体材料"],
      },
      durationMs: 128,
      fetchedAt: "2026-07-25 10:00:00",
      expiresAt: "2026-07-26 10:00:00",
    });

    expect(getFreshSourceSnapshot(db, "300346", "eastmoney_push2", new Date("2026-07-25T12:00:00+08:00"))).toMatchObject({
      stockCode: "300346",
      provider: "eastmoney_push2",
      status: "success",
      facts: {
        shortName: "南大光电",
        industry: "电子化学品",
        concepts: ["光刻胶", "半导体材料"],
      },
      durationMs: 128,
    });
  });

  it("does not treat failed or expired snapshots as fresh", () => {
    const db = setupDb();

    upsertSourceSnapshot(db, {
      stockCode: "300346",
      provider: "baidu_related_blocks",
      providerLabel: "百度关联板块",
      status: "success",
      facts: { concepts: ["光刻胶"] },
      fetchedAt: "2026-07-24 10:00:00",
      expiresAt: "2026-07-24 11:00:00",
    });
    upsertSourceSnapshot(db, {
      stockCode: "300346",
      provider: "eastmoney_f10_company_survey",
      providerLabel: "东方财富公司概况",
      status: "failed",
      error: "上游超时",
      durationMs: 3_500,
    });

    expect(getFreshSourceSnapshot(db, "300346", "baidu_related_blocks", new Date("2026-07-25T12:00:00+08:00"))).toBeNull();
    expect(getFreshSourceSnapshot(db, "300346", "eastmoney_f10_company_survey")).toBeNull();
    expect(listSourceSnapshots(db, "300346")).toEqual([
      expect.objectContaining({
        provider: "baidu_related_blocks",
        status: "success",
        facts: { concepts: ["光刻胶"] },
      }),
      expect.objectContaining({
        provider: "eastmoney_f10_company_survey",
        status: "failed",
        error: "上游超时",
        durationMs: 3_500,
      }),
    ]);
  });

  it("updates the latest status for the same company and provider", () => {
    const db = setupDb();

    upsertSourceSnapshot(db, {
      stockCode: "300346",
      provider: "eastmoney_f10_business_analysis",
      providerLabel: "东方财富经营分析",
      status: "failed",
      error: "临时不可用",
    });
    upsertSourceSnapshot(db, {
      stockCode: "300346",
      provider: "eastmoney_f10_business_analysis",
      providerLabel: "东方财富经营分析",
      status: "success",
      facts: { mainProducts: ["电子特气", "光刻胶材料"] },
      durationMs: 420,
    });

    expect(listSourceSnapshots(db, "300346")).toEqual([
      expect.objectContaining({
        provider: "eastmoney_f10_business_analysis",
        status: "success",
        facts: { mainProducts: ["电子特气", "光刻胶材料"] },
        error: "",
        durationMs: 420,
      }),
    ]);
  });

  it("keeps the last successful cache usable when a later refresh fails", () => {
    const db = setupDb();

    upsertSourceSnapshot(db, {
      stockCode: "300346",
      provider: "eastmoney_push2",
      providerLabel: "东方财富基础资料",
      status: "success",
      facts: { shortName: "南大光电", industry: "电子化学品" },
      fetchedAt: "2026-07-25 10:00:00",
      expiresAt: "2026-07-26 10:00:00",
    });
    upsertSourceSnapshot(db, {
      stockCode: "300346",
      provider: "eastmoney_push2",
      providerLabel: "东方财富基础资料",
      status: "failed",
      error: "上游暂时不可用",
      fetchedAt: "2026-07-25 11:00:00",
      expiresAt: "2026-07-25 11:05:00",
    });

    expect(listSourceSnapshots(db, "300346")[0]).toMatchObject({
      status: "failed",
      error: "上游暂时不可用",
    });
    expect(getFreshSourceSnapshot(db, "300346", "eastmoney_push2", new Date("2026-07-25T12:00:00+08:00"))).toMatchObject({
      status: "success",
      facts: { shortName: "南大光电", industry: "电子化学品" },
      fetchedAt: "2026-07-25 10:00:00",
    });
  });
});

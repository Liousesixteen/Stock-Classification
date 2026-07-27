import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { getResearchQueue } from "@/lib/repositories/researchQueue";
import { syncAutomaticResearchTasks } from "@/lib/repositories/researchTasks";
import { upsertCompanyFieldFact } from "@/lib/repositories/companyFieldFacts";
import { setRelationWatchlist } from "@/lib/repositories/relations";

function setupDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedSemiconductorData(db);
  return db;
}

describe("research queue repository", () => {
  it("keeps untouched starter data out of the actionable queue", () => {
    const db = setupDb();
    syncAutomaticResearchTasks(db);
    const queue = getResearchQueue(db);

    expect(queue.items).toEqual([]);
    expect(Object.values(queue.stats).every((count) => count === 0)).toBe(true);
  });

  it("raises watched relations to the top of the queue", () => {
    const db = setupDb();
    const relationId = (db.prepare("select id from company_category_relations order by id desc limit 1").get() as { id: number }).id;
    expect(setRelationWatchlist(db, relationId, true)).toBe(1);
    syncAutomaticResearchTasks(db);

    const after = getResearchQueue(db);
    expect(after.items[0].relationId).toBe(relationId);
    expect(after.items[0].reasons).toContain("已关注");
    expect(after.stats.已关注).toBe(1);
  });

  it("turns field-level provider failures and missing values into sync tasks", () => {
    const db = setupDb();
    const stockCode = (db.prepare("select stock_code as stockCode from companies order by stock_code limit 1").get() as { stockCode: string }).stockCode;
    upsertCompanyFieldFact(db, {
      stockCode,
      fieldKey: "revenue",
      provider: "sina_income_statement",
      providerLabel: "新浪财经利润表",
      status: "failed",
      confidence: "high",
      error: "upstream unavailable",
    });
    upsertCompanyFieldFact(db, {
      stockCode,
      fieldKey: "businessComposition",
      provider: "eastmoney_f10_business_analysis",
      providerLabel: "东方财富 F10 经营分析",
      status: "missing",
      confidence: "high",
    });
    syncAutomaticResearchTasks(db);

    const updated = getResearchQueue(db).items.filter((candidate) => candidate.stockCode === stockCode);
    expect(updated.some((candidate) => candidate.taskType === "sync_failure" && candidate.fieldKey === "revenue")).toBe(true);
    expect(updated.some((candidate) => candidate.taskType === "missing_field" && candidate.fieldKey === "businessComposition")).toBe(true);
    expect(updated.find((candidate) => candidate.taskType === "sync_failure")?.failedFieldCount).toBe(1);
    expect(updated.find((candidate) => candidate.taskType === "missing_field")?.fieldIssueCount).toBe(2);
  });
});

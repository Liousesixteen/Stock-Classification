import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import {
  completeResearchTask,
  listResearchTasks,
  syncAutomaticResearchTasks,
} from "@/lib/repositories/researchTasks";
import { upsertCompanyFieldFact } from "@/lib/repositories/companyFieldFacts";
import { saveResearchRun } from "@/lib/repositories/aiResearch";

function setupDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedSemiconductorData(db);
  return db;
}

describe("research tasks repository", () => {
  it("creates idempotent automatic tasks and completes resolved field gaps", () => {
    const db = setupDb();
    upsertCompanyFieldFact(db, {
      stockCode: "300346",
      fieldKey: "revenue",
      provider: "test-provider",
      providerLabel: "测试数据源",
      status: "failed",
      confidence: "high",
      error: "upstream unavailable",
    });

    syncAutomaticResearchTasks(db);
    const firstCount = (db.prepare("select count(*) as count from research_tasks").get() as { count: number }).count;
    syncAutomaticResearchTasks(db);
    const secondCount = (db.prepare("select count(*) as count from research_tasks").get() as { count: number }).count;
    expect(secondCount).toBe(firstCount);

    const failure = listResearchTasks(db).find((task) =>
      task.stockCode === "300346" && task.fieldKey === "revenue" && task.provider === "test-provider",
    );
    expect(failure?.taskType).toBe("sync_failure");

    upsertCompanyFieldFact(db, {
      stockCode: "300346",
      fieldKey: "revenue",
      provider: "test-provider",
      providerLabel: "测试数据源",
      value: 123,
      status: "available",
      sourceUrl: "https://example.com/revenue",
      confidence: "high",
    });
    syncAutomaticResearchTasks(db);
    const active = listResearchTasks(db);
    expect(active.some((task) => task.id === failure?.id)).toBe(false);
    const persisted = listResearchTasks(db, { includeCompleted: true }).find((task) => task.id === failure?.id);
    expect(persisted?.status).toBe("completed");
    expect(persisted?.resolution).toContain("问题已经解除");
  });

  it("writes relation verification state without fabricating a higher confidence", () => {
    const db = setupDb();
    const relation = db.prepare("select id, confidence from company_category_relations limit 1").get() as {
      id: number;
      confidence: string;
    };
    db.prepare(`
      update company_category_relations
      set relation_type = '待验证', confidence = '低', verification_status = 'unverified'
      where id = ?
    `).run(relation.id);
    db.prepare("update company_category_relations set is_watchlist = 1 where id = ?").run(relation.id);
    syncAutomaticResearchTasks(db);

    const task = listResearchTasks(db).find((item) =>
      item.relationId === relation.id && item.taskType === "low_confidence",
    );
    expect(task?.canComplete).toBe(true);
    const completed = completeResearchTask(db, task!.id, "已核对年报业务描述");
    expect(completed?.status).toBe("completed");

    const verified = db.prepare(`
      select confidence, verification_status as verificationStatus, verified_at as verifiedAt
      from company_category_relations where id = ?
    `).get(relation.id) as { confidence: string; verificationStatus: string; verifiedAt: string };
    expect(verified.confidence).toBe("低");
    expect(verified.verificationStatus).toBe("verified");
    expect(verified.verifiedAt).not.toBe("");
    expect(listResearchTasks(db).some((item) => item.id === task?.id)).toBe(false);
  });

  it("falls back to the company's real category when a historical AI run has a stale category", () => {
    const db = setupDb();
    const relation = db.prepare(`
      select relation.stock_code as stockCode, relation.category_id as categoryId
      from company_category_relations relation
      order by relation.id limit 1
    `).get() as { stockCode: string; categoryId: number };
    const staleCategory = db.prepare(
      "select id from categories where id != ? order by id desc limit 1",
    ).get(relation.categoryId) as { id: number };
    saveResearchRun(db, {
      stockCode: relation.stockCode,
      categoryId: staleCategory.id,
      question: "历史研究",
      depth: "quick",
      result: {
        thesis: "当前没有足够的可引用证据形成研究结论。",
        investmentValue: "待验证",
        confidence: "低",
        stages: [],
        catalysts: [],
        risks: [],
        verificationQuestions: [],
        evidenceBoundary: "本地证据",
        model: "test-model",
        citations: [],
      },
    });

    syncAutomaticResearchTasks(db);
    const aiTask = listResearchTasks(db).find((task) => task.sourceRef.startsWith("ai-run:"));
    expect(aiTask?.categoryId).toBe(relation.categoryId);
  });
});

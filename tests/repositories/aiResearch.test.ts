import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import {
  getLatestResearchReport,
  getLatestResearchRun,
  getLatestUniversalResearchRun,
  saveResearchReport,
  saveResearchRun,
  saveUniversalResearchRun,
} from "@/lib/repositories/aiResearch";

describe("AI research repository", () => {
  it("persists the latest team result and generated report", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    db.prepare("insert into companies (stock_code, short_name) values (?, ?)").run("000001", "示例公司");
    const result = {
      thesis: "具备调研价值",
      investmentValue: "继续核验",
      confidence: "中" as const,
      stages: [],
      catalysts: [],
      risks: [],
      verificationQuestions: [],
      evidenceBoundary: "本地证据",
      model: "test-model",
    };
    saveResearchRun(db, { stockCode: "000001", categoryId: null, question: "为什么", depth: "standard", result });
    saveResearchReport(db, {
      stockCode: "000001",
      categoryId: null,
      reportType: "company",
      report: {
        title: "报告",
        executiveSummary: "摘要",
        markdown: "# 报告",
        model: "test-model",
        citations: [],
        quality: { score: 0, sectionCoverage: 0, citationCoverage: 0, evidenceQuality: 0, riskDisclosure: 0, unsupportedClaimCount: 0, issues: [] },
        charts: [],
      },
    });
    expect(getLatestResearchRun(db, "000001")?.result?.thesis).toBe("具备调研价值");
    expect(getLatestResearchReport(db, "000001")?.markdown).toBe("# 报告");

    saveUniversalResearchRun(db, {
      subjectType: "industry",
      subjectKey: "12",
      subjectLabel: "机器人",
      categoryId: null,
      question: "机器人产业链有哪些关键变量？",
      depth: "quick",
      result,
    });
    expect(getLatestUniversalResearchRun(db, "industry", "12")).toMatchObject({
      subjectLabel: "机器人",
      depth: "quick",
      result: { thesis: "具备调研价值" },
    });
    db.close();
  });
});

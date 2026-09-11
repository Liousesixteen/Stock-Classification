import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import {
  addResearchMessage,
  deleteResearchSession,
  getResearchSession,
  getLatestResearchReport,
  getLatestResearchRun,
  getLatestUniversalResearchRun,
  saveResearchReport,
  saveResearchRun,
  saveUniversalResearchRun,
  listResearchSessions,
  upsertResearchSession,
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

  it("persists multi-turn research sessions, skills and result metadata", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    db.prepare("insert into companies (stock_code, short_name) values (?, ?)").run("000001", "示例公司");

    upsertResearchSession(db, {
      sessionId: "research-session-1",
      title: "用缠论分析示例公司",
      targetType: "company",
      subjectKey: "000001",
      subjectLabel: "示例公司",
      stockCode: "000001",
      categoryId: null,
      depth: "deep",
      skills: ["chan_theory", "wave_theory"],
      context: { text: "仅使用官方来源" },
    });
    addResearchMessage(db, {
      sessionId: "research-session-1",
      role: "user",
      content: "当前是什么结构？",
      metadata: { depth: "deep", skills: ["chan_theory", "wave_theory"] },
    });
    addResearchMessage(db, {
      sessionId: "research-session-1",
      role: "assistant",
      content: "技术数据不足，暂不能确认浪型。",
      metadata: {
        result: {
          thesis: "证据不足",
          investmentValue: "先补数据",
          confidence: "低",
          stages: [],
          catalysts: [],
          risks: ["技术结构待核验"],
          verificationQuestions: ["补充120日日线"],
          evidenceBoundary: "仅限本地证据",
          model: "test-model",
        },
      },
    });
    addResearchMessage(db, {
      sessionId: "research-session-1",
      role: "assistant",
      content: "[研究已停止] 研究请求已取消",
      metadata: { error: "研究请求已取消", cancelled: true },
    });

    expect(listResearchSessions(db)).toContainEqual(expect.objectContaining({
      sessionId: "research-session-1",
      messageCount: 3,
      skills: ["chan_theory", "wave_theory"],
    }));
    const messages = getResearchSession(db, "research-session-1")?.messages ?? [];
    expect(messages.at(-2)?.metadata.result?.thesis).toBe("证据不足");
    expect(messages.at(-1)?.metadata).toMatchObject({ error: "研究请求已取消", cancelled: true });
    expect(deleteResearchSession(db, "research-session-1")).toBe(true);
    expect(getResearchSession(db, "research-session-1")).toBeNull();
    db.close();
  });
});

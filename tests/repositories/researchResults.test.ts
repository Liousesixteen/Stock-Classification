import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { seedSemiconductorData } from "@/lib/db/seed";
import { saveResearchReport, saveResearchRun, saveUniversalResearchRun } from "@/lib/repositories/aiResearch";
import { createResearchDocument } from "@/lib/repositories/researchDocuments";
import { listResearchResults, setResearchArtifactState } from "@/lib/repositories/researchResults";

describe("research results repository", () => {
  it("combines research outputs without a published workflow state", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    seedSemiconductorData(db);

    saveResearchRun(db, {
      stockCode: "600030",
      categoryId: null,
      question: "公司的产业链位置和主要风险是什么？",
      depth: "deep",
      result: {
        thesis: "公司处于证券服务核心环节，仍需结合经营数据和业务证据持续验证。",
        investmentValue: "具备进一步调研价值",
        confidence: "中",
        stages: [],
        catalysts: ["资本市场活跃度提升"],
        risks: ["市场成交波动"],
        verificationQuestions: ["核心业务收入占比是否稳定？"],
        evidenceBoundary: "本地结构化资料与关系证据",
        model: "test-model",
      },
    });
    saveResearchReport(db, {
      stockCode: "600030",
      categoryId: null,
      reportType: "company",
      report: {
        title: "中信证券公司深度研究",
        executiveSummary: "围绕主营业务、产业链位置、竞争优势、催化因素和主要风险形成结构化研究结论，并保留证据核验边界。",
        markdown: "# 中信证券公司深度研究\n\n## 投资摘要\n结构化研究内容。",
        model: "test-model",
        citations: [],
        quality: { score: 0, sectionCoverage: 0, citationCoverage: 0, evidenceQuality: 0, riskDisclosure: 0, unsupportedClaimCount: 0, issues: [] },
        charts: [],
      },
    });
    saveUniversalResearchRun(db, {
      subjectType: "question",
      subjectKey: "question-demo",
      subjectLabel: "开放研究问题",
      categoryId: null,
      question: "当前证据是否足以形成结论？",
      depth: "quick",
      result: {
        thesis: "当前证据不足",
        investmentValue: "先补证据",
        confidence: "低",
        stages: [],
        catalysts: ["待验证"],
        risks: ["证据不足"],
        verificationQuestions: ["补充哪些资料？"],
        evidenceBoundary: "仅限本地资料",
        model: "test-model",
        citations: [],
        unsupportedClaimCount: 1,
        execution: { mode: "quick", agentCalls: 1, maxAgentCalls: 1, totalTokens: 100, maxOutputTokens: 1800, elapsedMs: 500, timeoutMs: 18000 },
      },
    });
    createResearchDocument(db, {
      reportType: "industry",
      subjectKey: "1",
      subjectLabel: "半导体",
      stockCode: "",
      categoryId: 1,
      comparisonCodes: [],
      title: "半导体赛道研究报告",
      executiveSummary: "赛道研究摘要",
      markdown: "# 半导体赛道研究报告",
      model: "test-model",
      status: "ready",
      citations: [{ id: "evidence:1", title: "行业资料", sourceType: "研报", sourceDate: "", url: "", excerpt: "资料", credibility: "中" }],
      quality: { score: 86, sectionCoverage: 100, citationCoverage: 80, evidenceQuality: 72, riskDisclosure: 100, unsupportedClaimCount: 0, issues: [] },
      charts: [],
    });

    const library = listResearchResults(db);

    expect(library.artifacts.some((artifact) => artifact.kind === "report")).toBe(true);
    expect(library.artifacts.some((artifact) => artifact.kind === "ai")).toBe(true);
    expect(library.artifacts.some((artifact) => artifact.kind === "snapshot")).toBe(true);
    expect(library.artifacts).toContainEqual(expect.objectContaining({ id: "document-1", kind: "report", completeness: 86, categoryName: "半导体" }));
    expect(library.artifacts).toContainEqual(expect.objectContaining({ id: "universal-run-1", kind: "ai", stage: "needs_work", categoryName: "开放研究" }));
    expect(library.artifacts.every((artifact) => ["ready", "draft", "needs_work"].includes(artifact.stage))).toBe(true);
    expect(library.stats.total).toBe(library.artifacts.length);
    expect(JSON.stringify(library)).not.toContain("published");

    const archived = setResearchArtifactState(db, "document-1", { archived: true });
    expect(archived?.archived).toBe(true);
    expect(listResearchResults(db).artifacts.find((artifact) => artifact.id === "document-1")?.archived).toBe(true);

    db.close();
  });
});

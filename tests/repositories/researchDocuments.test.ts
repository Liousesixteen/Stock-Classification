import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import {
  createResearchDocument,
  getLatestResearchDocument,
  getResearchDocument,
  listResearchDocumentVersions,
  saveResearchDocumentVersion,
} from "@/lib/repositories/researchDocuments";

const quality = {
  score: 82,
  sectionCoverage: 100,
  citationCoverage: 80,
  evidenceQuality: 90,
  riskDisclosure: 100,
  unsupportedClaimCount: 0,
  issues: [],
};

describe("research document repository", () => {
  it("stores four-type reports and appends immutable versions", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    db.prepare("insert into companies (stock_code, short_name) values (?, ?)").run("000001", "示例公司");

    const id = createResearchDocument(db, {
      reportType: "company",
      subjectKey: "000001",
      subjectLabel: "示例公司",
      stockCode: "000001",
      categoryId: null,
      comparisonCodes: [],
      title: "示例公司研究报告",
      executiveSummary: "摘要",
      markdown: "# 示例公司研究报告\n\n## 投资摘要\n\n有证据的结论 [evidence:1]",
      model: "test-model",
      status: "ready",
      citations: [{ id: "evidence:1", title: "公告", sourceType: "公告", sourceDate: "2026-01-01", url: "", excerpt: "事实", credibility: "高" }],
      quality,
      charts: [],
    });
    saveResearchDocumentVersion(db, {
      reportId: id,
      content: "# 示例公司研究报告\n\n## 投资摘要\n\n编辑后的结论 [evidence:1]",
      changeSummary: "编辑摘要",
      source: "edited",
      quality: { ...quality, score: 88 },
    });

    expect(getResearchDocument(db, id)).toMatchObject({ currentVersion: 2, quality: { score: 88 } });
    expect(getLatestResearchDocument(db, "company", "000001")?.id).toBe(id);
    expect(listResearchDocumentVersions(db, id).map((version) => version.versionNumber)).toEqual([2, 1]);
    db.close();
  });
});

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createResearchDocumentExport } from "@/lib/export/researchDocument";
import type { StoredResearchDocument } from "@/lib/repositories/researchDocuments";

const report: StoredResearchDocument = {
  id: 1,
  reportType: "company",
  subjectKey: "000001",
  subjectLabel: "示例公司",
  stockCode: "000001",
  categoryId: null,
  comparisonCodes: [],
  title: "示例公司产业链研究报告",
  executiveSummary: "基于公告证据形成的中文研究摘要。",
  markdown: "# 示例公司产业链研究报告\n\n> 基于公告证据形成的中文研究摘要。\n\n## 投资摘要\n\n- 公司业务仍需持续核验 [evidence:1]\n\n## 风险与反证\n\n需求波动风险待验证。",
  model: "test-model",
  status: "ready",
  currentVersion: 1,
  citations: [{ id: "evidence:1", title: "示例公告", sourceType: "公告", sourceDate: "2026-01-01", url: "", excerpt: "公告正文", credibility: "高" }],
  quality: { score: 80, sectionCoverage: 80, citationCoverage: 80, evidenceQuality: 100, riskDisclosure: 80, unsupportedClaimCount: 0, issues: [] },
  charts: [{
    id: "chart-1",
    title: "主营收入构成",
    kind: "bar",
    unit: "%",
    sourceCitationIds: ["evidence:1"],
    rows: [{ label: "核心业务", value: 70, secondary: 35 }, { label: "其他业务", value: 30, secondary: 20 }],
  }],
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
};

describe("research document export", () => {
  it("creates real markdown, docx, and Chinese PDF files", async () => {
    const markdown = await createResearchDocumentExport(report, "markdown");
    const docx = await createResearchDocumentExport(report, "docx");
    const pdf = await createResearchDocumentExport(report, "pdf");

    expect(new TextDecoder().decode(markdown)).toContain("示例公司产业链研究报告");
    expect(String.fromCharCode(...docx.slice(0, 2))).toBe("PK");
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe("%PDF");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(0);
  });
});

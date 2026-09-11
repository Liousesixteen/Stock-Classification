import { describe, expect, it } from "vitest";
import type { CompanyResearchFacts } from "@/lib/agents/deepseekResearchAgent";
import { buildResearchEvidenceCatalog } from "@/lib/research/researchEvidenceCatalog";

function facts(overrides: Partial<CompanyResearchFacts> = {}): CompanyResearchFacts {
  return {
    subject: { kind: "company", label: "示例公司", key: "000001" },
    company: {},
    relations: [],
    evidence: [],
    researchProfile: null,
    fieldFacts: [],
    dossierQuality: {},
    evidenceTimeline: [],
    graphRelations: [],
    notes: [],
    ...overrides,
  };
}

describe("research evidence catalog", () => {
  it("keeps verified or traceable sources and excludes synthetic, expired and rejected material", () => {
    const catalog = buildResearchEvidenceCatalog(facts({
      evidence: [
        { id: 1, title: "可追溯公告", url: "https://example.com/notice", excerpt: "公开披露。", verificationStatus: "unverified", isExpired: false },
        { id: 2, title: "自动归纳", url: "", excerpt: "模型生成。", verificationStatus: "unverified", isExpired: false },
        { id: 3, title: "过期公告", url: "https://example.com/old", excerpt: "过期资料。", verificationStatus: "verified", isExpired: true },
        { id: 4, title: "人工核验证据", url: "", excerpt: "已完成线下核验。", verificationStatus: "verified", isExpired: false },
        { id: 5, title: "驳回证据", url: "https://example.com/rejected", excerpt: "存在错误。", verificationStatus: "rejected", isExpired: false },
      ],
      fieldFacts: [
        { fieldKey: "revenue", status: "available", provider: "年报", value: 100, sourceUrl: "https://example.com/annual", verificationStatus: "unverified" },
        { fieldKey: "profit", status: "available", provider: "错误源", value: 20, sourceUrl: "https://example.com/wrong", verificationStatus: "rejected" },
        { fieldKey: "price", status: "available", provider: "手工核验", value: 10, sourceUrl: "", verificationStatus: "verified" },
      ],
      relations: [{ id: 9, rationale: "仅为研究人员判断，不应成为事实引用。" }],
      notes: [{ id: 3, content: "研究备注也不是外部来源。" }],
    }));

    expect(catalog.map((item) => item.id)).toEqual([
      "evidence:1",
      "evidence:4",
      "field:revenue:年报",
      "field:price:手工核验",
    ]);
  });

  it("requires graph evidence previews to be verified or carry a traceable URL", () => {
    const catalog = buildResearchEvidenceCatalog(facts({
      graphRelations: [{
        entityName: "先进封装",
        rationale: "关系判断",
        evidencePreviews: [
          { id: 1, title: "无来源线索", url: "", excerpt: "线索", verificationStatus: "unverified" },
          { id: 2, title: "来源公告", url: "https://example.com/source", excerpt: "披露", verificationStatus: "unverified" },
        ],
      }],
    }));

    expect(catalog).toEqual([
      expect.objectContaining({ id: "graph-evidence:2", title: "来源公告" }),
    ]);
  });

  it("uses the source publication date and readable metadata for market news", () => {
    const catalog = buildResearchEvidenceCatalog(facts({
      fieldFacts: [{
        fieldKey: "marketNews:1",
        status: "available",
        provider: "DA-Stock · bocha",
        sourceUrl: "https://example.com/market-news",
        confidence: "medium",
        verificationStatus: "unverified",
        fetchedAt: "2026-08-12T09:00:00.000Z",
        value: {
          title: "监管机构发布市场通知",
          summary: "通知包含可核验的市场安排。",
          source: "监管网站",
          sourceDate: "2026-08-11",
        },
      }],
    }));

    expect(catalog[0]).toMatchObject({
      title: "监管机构发布市场通知",
      sourceType: "监管网站",
      sourceDate: "2026-08-11",
      excerpt: "通知包含可核验的市场安排。",
    });
  });
});

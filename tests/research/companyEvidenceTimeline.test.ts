import { describe, expect, it } from "vitest";
import type { Evidence } from "@/lib/domain/types";
import { buildCompanyEvidenceTimeline } from "@/lib/research/companyEvidenceTimeline";
import type { CompanyFieldFact } from "@/lib/repositories/companyFieldFacts";

function fact(fieldKey: string, value: unknown, overrides: Partial<CompanyFieldFact> = {}): CompanyFieldFact {
  return {
    stockCode: "300346",
    fieldKey,
    provider: "provider",
    providerLabel: "公开数据源",
    value,
    status: "available",
    sourceUrl: "https://example.com/source",
    confidence: "high",
    verificationStatus: "verified",
    error: "",
    fetchedAt: "2026-07-25T08:00:00.000Z",
    createdAt: "2026-07-25T08:00:00.000Z",
    updatedAt: "2026-07-25T08:00:00.000Z",
    ...overrides,
  };
}

describe("company evidence timeline", () => {
  it("normalizes announcements, reports, relation evidence and field provenance into one timeline", () => {
    const relationEvidence: Evidence = {
      id: 7,
      relationId: 3,
      sourceType: "公告",
      title: "年度报告产业链披露",
      sourceDate: "2026-03-28",
      url: "https://example.com/annual",
      excerpt: "披露光刻胶业务进展。",
      credibility: "高",
      isExpired: false,
      verificationStatus: "unverified",
      verifiedAt: "",
    };
    const timeline = buildCompanyEvidenceTimeline({
      relations: [{ id: 3, categoryName: "光刻胶", relationType: "主营业务" }],
      evidenceByRelationId: { 3: [relationEvidence] },
      fieldFacts: [
        fact("announcements", [{ title: "最新经营公告", type: "临时公告", date: "2026-07-24", url: "https://example.com/notice" }]),
        fact("researchReports", [{ title: "电子材料深度", publishDate: "2026-07-23", organization: "研究机构", rating: "增持", pdfUrl: "https://example.com/report" }]),
        fact("revenue", 1_000_000_000),
      ],
      researchProfile: null,
    });

    expect(timeline.map((item) => item.kind)).toEqual([
      "field_fact",
      "announcement",
      "research_report",
      "relation_evidence",
    ]);
    expect(timeline[1]).toEqual(expect.objectContaining({
      title: "最新经营公告",
      source: "公开数据源",
      status: "verified",
      url: "https://example.com/notice",
    }));
    expect(timeline[2]?.summary).toContain("研究机构");
    expect(timeline[3]).toEqual(expect.objectContaining({ fieldKey: "chainPosition", status: "available", statusLabel: "来源可用" }));
  });

  it("does not present untraceable or rejected relation material as verified evidence", () => {
    const base: Evidence = {
      id: 8,
      relationId: 3,
      sourceType: "其他",
      title: "自动归纳资料",
      sourceDate: "",
      url: "",
      excerpt: "模型生成的关系线索。",
      credibility: "中",
      isExpired: false,
      verificationStatus: "unverified",
      verifiedAt: "",
    };
    const timeline = buildCompanyEvidenceTimeline({
      relations: [{ id: 3, categoryName: "光刻胶", relationType: "待验证" }],
      evidenceByRelationId: {
        3: [
          base,
          { ...base, id: 9, title: "已驳回自动归纳", verificationStatus: "rejected" },
        ],
      },
      fieldFacts: [],
      researchProfile: null,
    });

    expect(timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "relation-evidence:9", status: "conflicted", statusLabel: "已驳回" }),
      expect.objectContaining({ id: "relation-evidence:8", status: "unverified", statusLabel: "待核验" }),
    ]));
  });

  it("keeps failed field updates visible as actionable provenance events", () => {
    const timeline = buildCompanyEvidenceTimeline({
      relations: [],
      evidenceByRelationId: {},
      fieldFacts: [
        fact("revenue", null, {
          status: "failed",
          verificationStatus: "unverified",
          error: "接口超时",
        }),
      ],
      researchProfile: null,
    });

    expect(timeline[0]).toEqual(expect.objectContaining({
      title: "营业收入同步失败",
      summary: "接口超时",
      status: "failed",
    }));
  });
});

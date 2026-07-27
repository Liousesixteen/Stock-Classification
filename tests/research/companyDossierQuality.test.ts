import { describe, expect, it } from "vitest";
import type { Company, Evidence } from "@/lib/domain/types";
import { assessCompanyDossierQuality } from "@/lib/research/companyDossierQuality";
import type { CompanyFieldFact } from "@/lib/repositories/companyFieldFacts";
import type { CompanyResearchProfile } from "@/lib/repositories/researchProfiles";

const company: Company = {
  stockCode: "300346",
  shortName: "南大光电",
  fullName: "江苏南大光电材料股份有限公司",
  board: "创业板",
  industry: "电子化学品",
  region: "江苏",
  marketCapBand: "100-300亿",
  intro: "面向集成电路制造的电子材料企业。",
  mainBusiness: "光刻胶材料、电子特气与前驱体材料。",
  updatedAt: "2026-07-25T08:00:00.000Z",
};

const researchProfile: CompanyResearchProfile = {
  stockCode: company.stockCode,
  summary: "公司覆盖多类先进电子材料。",
  businessLines: [{ name: "电子特气", share: "60%", grossMargin: "35%" }],
  chainPosition: ["半导体材料上游"],
  competitiveAdvantages: ["具备多品类研发和量产能力"],
  keyCustomers: ["国内晶圆制造客户"],
  catalysts: ["新产品验证与放量"],
  risks: ["客户验证进度不及预期"],
  sourceSummary: "2025 年年度报告",
  createdAt: "2026-07-25T08:00:00.000Z",
  updatedAt: "2026-07-25T08:00:00.000Z",
};

const relation = {
  id: 9,
  categoryName: "光刻胶",
  relationType: "主营业务",
  confidence: "高",
  rationale: "年报披露公司开展光刻胶业务。",
};

const evidence: Evidence = {
  id: 4,
  relationId: 9,
  sourceType: "公告",
  title: "2025 年年度报告",
  sourceDate: "2026-03-28",
  url: "https://example.com/annual-report",
  excerpt: "公司光刻胶产品处于客户验证和销售阶段。",
  credibility: "高",
  isExpired: false,
};

function fact(fieldKey: string, value: unknown, overrides: Partial<CompanyFieldFact> = {}): CompanyFieldFact {
  return {
    stockCode: company.stockCode,
    fieldKey,
    provider: "provider",
    providerLabel: "公开数据源",
    value,
    status: "available",
    sourceUrl: `https://example.com/${fieldKey}`,
    confidence: "high",
    verificationStatus: "verified",
    error: "",
    fetchedAt: "2026-07-25T08:00:00.000Z",
    createdAt: "2026-07-25T08:00:00.000Z",
    updatedAt: "2026-07-25T08:00:00.000Z",
    ...overrides,
  };
}

describe("company dossier quality", () => {
  it("scores actual field, evidence and freshness coverage instead of counting display strings", () => {
    const fieldFacts = [
      fact("fullName", company.fullName),
      fact("industry", company.industry),
      fact("region", company.region),
      fact("intro", company.intro),
      fact("mainBusiness", company.mainBusiness),
      fact("businessComposition", [{ name: "电子特气", revenueRatio: 60, grossMargin: 35 }]),
      fact("revenue", 1_000_000_000),
      fact("netProfit", 120_000_000),
      fact("operatingCashFlow", 150_000_000),
      fact("debtRatio", 0.35),
      fact("price", 35.62),
      fact("peTtm", 48.5),
      fact("announcements", [{ title: evidence.title, date: evidence.sourceDate, url: evidence.url }]),
      fact("researchReports", [{ title: "电子材料深度报告", publishDate: "2026-07-20", pdfUrl: "https://example.com/report.pdf" }]),
    ];

    const result = assessCompanyDossierQuality({
      company,
      relations: [relation],
      evidenceByRelationId: { 9: [evidence] },
      fieldFacts,
      researchProfile,
      now: new Date("2026-07-26T08:00:00.000Z"),
    });

    expect(result.fieldCoverageScore).toBe(100);
    expect(result.evidenceCoverageScore).toBeGreaterThanOrEqual(80);
    expect(result.freshnessScore).toBe(100);
    expect(result.overallScore).toBeGreaterThanOrEqual(90);
    expect(result.reliabilityLabel).toBe("可靠");
    expect(result.dimensions.every((item) => item.status === "complete")).toBe(true);
  });

  it("marks missing, failed, stale and weakly sourced fields without inventing completion", () => {
    const result = assessCompanyDossierQuality({
      company: { ...company, fullName: "", intro: "", mainBusiness: "", region: "", updatedAt: "2024-01-01T00:00:00.000Z" },
      relations: [],
      evidenceByRelationId: {},
      fieldFacts: [
        fact("price", 35.62, {
          verificationStatus: "unverified",
          sourceUrl: "",
          fetchedAt: "2026-07-20T00:00:00.000Z",
        }),
        fact("revenue", null, {
          status: "failed",
          error: "财务接口超时",
          verificationStatus: "unverified",
        }),
      ],
      researchProfile: null,
      now: new Date("2026-07-26T08:00:00.000Z"),
    });

    expect(result.fieldCoverageScore).toBeLessThan(25);
    expect(result.reliabilityLabel).toBe("资料不足");
    expect(result.failedFields).toBe(1);
    expect(result.staleFields).toBe(1);
    expect(result.criticalIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldKey: "revenue", status: "failed", reason: "财务接口超时" }),
        expect.objectContaining({ fieldKey: "chainPosition", status: "missing" }),
      ]),
    );
  });

  it("raises evidence coverage after a task verifies the relation without changing its confidence", () => {
    const input = {
      company,
      evidenceByRelationId: { 9: [] },
      fieldFacts: [],
      researchProfile: null,
      now: new Date("2026-07-26T08:00:00.000Z"),
    };
    const before = assessCompanyDossierQuality({ ...input, relations: [{ ...relation, verificationStatus: "unverified" as const }] });
    const after = assessCompanyDossierQuality({ ...input, relations: [{ ...relation, verificationStatus: "verified" as const }] });

    expect(after.evidenceCoverageScore).toBeGreaterThan(before.evidenceCoverageScore);
    expect(after.overallScore).toBeGreaterThanOrEqual(before.overallScore);
  });
});

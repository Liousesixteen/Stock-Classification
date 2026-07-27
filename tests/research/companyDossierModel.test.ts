import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "@/lib/db/schema";
import { buildCompanyDossierModel } from "@/lib/research/companyDossierModel";
import { buildCompanyResearchFacts } from "@/lib/research/companyFacts";
import { createCategory } from "@/lib/repositories/categories";
import { upsertCompany } from "@/lib/repositories/companies";
import { upsertCompanyFieldFact } from "@/lib/repositories/companyFieldFacts";
import { createEvidence } from "@/lib/repositories/evidence";
import { upsertRelation } from "@/lib/repositories/relations";

describe("unified company dossier model", () => {
  it("feeds the same quality and evidence model to company detail, atlas and AI research facts", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    upsertCompany(db, {
      stockCode: "300346",
      shortName: "南大光电",
      fullName: "江苏南大光电材料股份有限公司",
      board: "创业板",
      industry: "电子化学品",
      region: "江苏",
      marketCapBand: "100-300亿",
      intro: "电子材料企业。",
      mainBusiness: "光刻胶材料与电子特气。",
      updatedAt: "",
    });
    const categoryId = createCategory(db, { name: "光刻胶", industry: "半导体材料" });
    const relationId = upsertRelation(db, {
      stockCode: "300346",
      categoryId,
      relationType: "主营业务",
      confidence: "高",
      rationale: "年度报告披露光刻胶业务。",
      isWatchlist: false,
    });
    createEvidence(db, {
      relationId,
      sourceType: "年报",
      title: "2025 年年度报告",
      sourceDate: "2026-03-28",
      url: "https://example.com/report",
      excerpt: "披露光刻胶业务进展。",
      credibility: "高",
      isExpired: false,
    });
    upsertCompanyFieldFact(db, {
      stockCode: "300346",
      fieldKey: "price",
      provider: "tencent_quote",
      providerLabel: "腾讯财经实时估值",
      value: 35.62,
      status: "available",
      sourceUrl: "https://example.com/quote",
      confidence: "high",
      verificationStatus: "verified",
      fetchedAt: new Date().toISOString(),
    });

    const dossier = buildCompanyDossierModel(db, "300346");
    const aiFacts = buildCompanyResearchFacts(db, "300346", categoryId);

    expect(dossier).not.toBeNull();
    expect(aiFacts?.dossierQuality).toEqual(expect.objectContaining({
      overallScore: dossier?.quality.overallScore,
      evidenceCoverageScore: dossier?.quality.evidenceCoverageScore,
    }));
    expect(aiFacts?.fieldFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldKey: "price", provider: "腾讯财经实时估值", sourceUrl: "https://example.com/quote" }),
    ]));
    expect(aiFacts?.evidenceTimeline).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "relation_evidence", title: "2025 年年度报告" }),
      expect.objectContaining({ kind: "field_fact", fieldKey: "price" }),
    ]));
    db.close();
  });
});

import type Database from "better-sqlite3";
import type { CompanyResearchFacts } from "@/lib/agents/deepseekResearchAgent";
import { listCompanyGraphEntityRelations } from "@/lib/repositories/graphEntities";
import { listCompanyNotes } from "@/lib/repositories/notes";
import { getSectorResearch } from "@/lib/repositories/sectorResearch";
import { buildCompanyDossierModel } from "./companyDossierModel";
import { effectiveEvidenceSql } from "./evidenceTrust";

export function buildCompanyResearchFacts(db: Database.Database, stockCode: string, categoryId: number | null): CompanyResearchFacts | null {
  const dossier = buildCompanyDossierModel(db, stockCode);
  if (!dossier) return null;
  const allRelations = dossier.relations;
  const relations = categoryId === null ? allRelations : allRelations.filter((relation) => relation.categoryId === categoryId);
  const scopedRelations = relations.length > 0 ? relations : allRelations;
  const evidence = scopedRelations.flatMap((relation) =>
    (dossier.evidenceByRelationId[relation.id] ?? []).map((row) => ({ ...row, categoryId: relation.categoryId, categoryName: relation.categoryName })),
  );
  return {
    subject: { kind: "company", label: dossier.company.shortName, key: dossier.company.stockCode },
    company: { ...dossier.company },
    relations: scopedRelations.map((row) => ({ ...row })),
    evidence,
    researchProfile: { ...dossier.researchProfile },
    fieldFacts: dossier.fieldFacts.map((fact) => ({
      fieldKey: fact.fieldKey,
      value: fact.value,
      status: fact.status,
      provider: fact.providerLabel,
      sourceUrl: fact.sourceUrl,
      confidence: fact.confidence,
      verificationStatus: fact.verificationStatus,
      fetchedAt: fact.fetchedAt,
    })),
    dossierQuality: { ...dossier.quality },
    evidenceTimeline: dossier.evidenceTimeline.map((item) => ({ ...item })),
    graphRelations: listCompanyGraphEntityRelations(db, stockCode).map((row) => ({ ...row })),
    notes: listCompanyNotes(db, stockCode).map((row) => ({ ...row })),
  };
}

export function buildIndustryResearchFacts(db: Database.Database, categoryId: number): CompanyResearchFacts | null {
  const sector = getSectorResearch(db, categoryId);
  if (!sector) return null;
  const evidence = db.prepare(
    `
      with recursive branch(id) as (
        select id from categories where id = ? and is_active = 1
        union all
        select category.id from categories category join branch on category.parent_id = branch.id
        where category.is_active = 1
      )
      select evidence.id, evidence.source_type as sourceType, evidence.title,
        evidence.source_date as sourceDate, evidence.url, evidence.excerpt, evidence.credibility,
        evidence.is_expired as isExpired, evidence.verification_status as verificationStatus,
        evidence.verified_at as verifiedAt,
        relation.id as relationId, relation.relation_type as relationType,
        category.id as categoryId, category.name as categoryName,
        company.stock_code as stockCode, company.short_name as shortName
      from evidences evidence
      join company_category_relations relation on relation.id = evidence.relation_id
      join branch on branch.id = relation.category_id
      join categories category on category.id = relation.category_id
      join companies company on company.stock_code = relation.stock_code
      where ${effectiveEvidenceSql("evidence")}
      order by evidence.source_date desc, evidence.id desc
      limit 160
    `,
  ).all(categoryId) as Array<Record<string, unknown>>;

  return {
    subject: { kind: "industry", label: sector.category.name, key: String(categoryId) },
    company: {
      subjectType: "industry",
      category: sector.category,
      path: sector.path,
      stats: sector.stats,
    },
    relations: sector.companies.map((company) => ({ ...company })),
    evidence,
    researchProfile: null,
    fieldFacts: [],
    dossierQuality: {
      overallScore: Math.round(
        Math.min(1, sector.stats.evidenceCount / Math.max(1, sector.stats.companyCount)) * 70
        + sector.stats.profileCoverage * 0.3,
      ),
      evidenceCount: sector.stats.evidenceCount,
      profileCoverage: sector.stats.profileCoverage,
      reliabilityLabel: sector.stats.evidenceCount > 3 ? "可研判" : "待核验",
    },
    evidenceTimeline: evidence.map((row) => ({
      id: row.id,
      title: row.title,
      sourceType: row.sourceType,
      sourceDate: row.sourceDate,
      credibility: row.credibility,
    })),
    graphRelations: [],
    notes: [],
  };
}

export function buildOpenQuestionResearchFacts(question: string): CompanyResearchFacts {
  return {
    subject: { kind: "question", label: question.slice(0, 80) || "开放研究问题", key: stableQuestionKey(question) },
    company: { subjectType: "question", label: question.slice(0, 120) },
    relations: [],
    evidence: [],
    researchProfile: null,
    fieldFacts: [],
    dossierQuality: { overallScore: 0, reliabilityLabel: "无本地证据" },
    evidenceTimeline: [],
    graphRelations: [],
    notes: [],
  };
}

export function buildComparisonResearchFacts(db: Database.Database, stockCodes: string[]): CompanyResearchFacts | null {
  const uniqueCodes = [...new Set(stockCodes)].slice(0, 5);
  const companyFacts = uniqueCodes
    .map((stockCode) => buildCompanyResearchFacts(db, stockCode, null))
    .filter((facts): facts is CompanyResearchFacts => Boolean(facts));
  if (companyFacts.length < 2) return null;
  const labels = companyFacts.map((facts) => String(facts.subject?.label || facts.subject?.key));

  return {
    subject: { kind: "question", label: `${labels.join("、")}公司对比`, key: uniqueCodes.join("-") },
    company: {
      subjectType: "comparison",
      companies: companyFacts.map((facts) => facts.company),
    },
    relations: companyFacts.flatMap((facts) =>
      facts.relations.map((row) => ({ ...row, comparisonCompany: facts.subject?.label, comparisonCode: facts.subject?.key }))),
    evidence: companyFacts.flatMap((facts) =>
      facts.evidence.map((row) => ({ ...row, comparisonCompany: facts.subject?.label, comparisonCode: facts.subject?.key }))),
    researchProfile: null,
    fieldFacts: companyFacts.flatMap((facts) =>
      facts.fieldFacts.map((row) => ({
        ...row,
        fieldKey: `${facts.subject?.key}.${String(row.fieldKey ?? "field")}`,
        comparisonCompany: facts.subject?.label,
        comparisonCode: facts.subject?.key,
      }))),
    dossierQuality: {
      companies: companyFacts.map((facts) => ({
        stockCode: facts.subject?.key,
        companyName: facts.subject?.label,
        quality: facts.dossierQuality,
      })),
    },
    evidenceTimeline: companyFacts.flatMap((facts) =>
      facts.evidenceTimeline.map((row) => ({ ...row, comparisonCompany: facts.subject?.label }))),
    graphRelations: companyFacts.flatMap((facts) =>
      facts.graphRelations.map((row) => ({ ...row, comparisonCompany: facts.subject?.label }))),
    notes: companyFacts.flatMap((facts) =>
      facts.notes.map((row) => ({ ...row, comparisonCompany: facts.subject?.label }))),
  };
}

function stableQuestionKey(value: string) {
  let hash = 2166136261;
  for (const character of value.trim()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `question-${(hash >>> 0).toString(16)}`;
}

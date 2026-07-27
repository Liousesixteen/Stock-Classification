import type { Company, Evidence } from "@/lib/domain/types";
import type { CompanyFieldFact } from "@/lib/repositories/companyFieldFacts";
import type { CompanyResearchProfile } from "@/lib/repositories/researchProfiles";
import type { SourceSnapshot } from "@/lib/repositories/sourceSnapshots";

export type DossierQualityStatus = "complete" | "partial" | "missing";
export type DossierReliabilityLabel = "可靠" | "基本可靠" | "待核验" | "资料不足";

export type CompanyDossierQualityDimension = {
  id: "identity" | "business" | "chain" | "financial" | "research";
  label: string;
  score: number;
  status: DossierQualityStatus;
  available: number;
  expected: number;
  detail: string;
};

export type CompanyDossierQualityIssue = {
  fieldKey: string;
  label: string;
  status: "missing" | "failed" | "stale" | "unverified" | "conflicted";
  reason: string;
};

export type CompanyDossierQuality = {
  overallScore: number;
  fieldCoverageScore: number;
  evidenceCoverageScore: number;
  freshnessScore: number;
  reliabilityLabel: DossierReliabilityLabel;
  availableFields: number;
  expectedFields: number;
  evidencedFields: number;
  staleFields: number;
  failedFields: number;
  dimensions: CompanyDossierQualityDimension[];
  criticalIssues: CompanyDossierQualityIssue[];
  assessedAt: string;
};

export type DossierRelation = {
  id: number;
  categoryName?: string;
  relationType?: string;
  confidence?: string;
  rationale?: string;
  verificationStatus?: "unverified" | "verified";
};

export type CompanyDossierQualityInput = {
  company: Company;
  relations: DossierRelation[];
  evidenceByRelationId: Record<string | number, Evidence[]>;
  fieldFacts: CompanyFieldFact[];
  researchProfile: CompanyResearchProfile | null;
  sourceSnapshots?: SourceSnapshot[];
  now?: Date;
};

type DimensionId = CompanyDossierQualityDimension["id"];

type FieldAssessment = {
  fieldKey: string;
  label: string;
  dimension: DimensionId;
  weight: number;
  available: boolean;
  evidenceScore: number;
  freshnessScore: number | null;
  stale: boolean;
  fact?: CompanyFieldFact;
};

const PLACEHOLDER_PATTERN = /待补|待确认|待核验|待验证|待选择|待跟踪|待评估|暂无|未知|未披露|结构化资料|资料待补|相关业务$|自动结构化/;
const DAY_MS = 24 * 60 * 60 * 1000;

export function assessCompanyDossierQuality(input: CompanyDossierQualityInput): CompanyDossierQuality {
  const now = input.now ?? new Date();
  const factsByKey = groupFactsByKey(input.fieldFacts);
  const relationEvidence = input.relations.flatMap((relation) => input.evidenceByRelationId[String(relation.id)] ?? []);
  const assessments = buildFieldAssessments(input, factsByKey, relationEvidence, now);
  const totalWeight = sum(assessments.map((item) => item.weight));
  const availableWeight = sum(assessments.filter((item) => item.available).map((item) => item.weight));
  const availableAssessments = assessments.filter((item) => item.available);
  const fieldCoverageScore = percent(availableWeight, totalWeight);
  const evidenceCoverageScore =
    availableAssessments.length > 0
      ? Math.round(
          sum(availableAssessments.map((item) => item.evidenceScore * item.weight)) /
            sum(availableAssessments.map((item) => item.weight)),
        )
      : 0;
  const freshAssessments = availableAssessments.filter((item) => item.freshnessScore !== null);
  const freshnessScore =
    freshAssessments.length > 0
      ? Math.round(
          sum(freshAssessments.map((item) => (item.freshnessScore ?? 0) * item.weight)) /
            sum(freshAssessments.map((item) => item.weight)),
        )
      : 0;
  const overallScore = Math.round(fieldCoverageScore * 0.45 + evidenceCoverageScore * 0.35 + freshnessScore * 0.2);
  const failedFacts = input.fieldFacts.filter((fact) => fact.status === "failed");
  const conflictedFacts = input.fieldFacts.filter((fact) => fact.verificationStatus === "conflicted" || fact.verificationStatus === "rejected");
  const staleFields = new Set(assessments.filter((item) => item.stale).map((item) => item.fieldKey)).size;
  const evidencedFields = assessments.filter((item) => item.available && item.evidenceScore >= 60).length;

  return {
    overallScore,
    fieldCoverageScore,
    evidenceCoverageScore,
    freshnessScore,
    reliabilityLabel: getReliabilityLabel(overallScore, fieldCoverageScore, evidenceCoverageScore, conflictedFacts.length),
    availableFields: assessments.filter((item) => item.available).length,
    expectedFields: assessments.length,
    evidencedFields,
    staleFields,
    failedFields: failedFacts.length,
    dimensions: buildDimensions(assessments),
    criticalIssues: buildIssues(assessments, failedFacts, conflictedFacts, input.sourceSnapshots ?? []).slice(0, 8),
    assessedAt: now.toISOString(),
  };
}

export function selectBestCompanyFieldFact(facts: CompanyFieldFact[], fieldKey: string) {
  return facts
    .filter((fact) => fact.fieldKey === fieldKey)
    .sort(compareFacts)[0];
}

export function isMeaningfulDossierValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 && !PLACEHOLDER_PATTERN.test(trimmed);
  }
  if (Array.isArray(value)) return value.some(isMeaningfulDossierValue);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some(isMeaningfulDossierValue);
  return false;
}

function buildFieldAssessments(
  input: CompanyDossierQualityInput,
  factsByKey: Map<string, CompanyFieldFact[]>,
  relationEvidence: Evidence[],
  now: Date,
): FieldAssessment[] {
  const company = input.company;
  const profile = input.researchProfile;
  const relation = input.relations[0];

  return [
    assessCompanyField("fullName", "公司全称", "identity", 3, company.fullName, factsByKey, now, 365),
    assessCompanyField("industry", "所属行业", "identity", 3, company.industry, factsByKey, now, 365),
    assessCompanyField("region", "注册地区", "identity", 1, company.region, factsByKey, now, 365),
    assessCompanyField("intro", "公司简介", "identity", 2, company.intro, factsByKey, now, 365),
    assessCompanyField("mainBusiness", "主营业务", "business", 5, company.mainBusiness, factsByKey, now, 365),
    assessFactField("businessComposition", "主营构成", "business", 5, factsByKey, now, 365),
    assessRelationField(relation, relationEvidence, now),
    assessProfileField("competitiveAdvantages", "核心优势", "research", 3, profile?.competitiveAdvantages, profile, now),
    assessProfileField("keyCustomers", "核心客户", "research", 2, profile?.keyCustomers, profile, now),
    assessFactField("revenue", "营业收入", "financial", 4, factsByKey, now, 200),
    assessFactField("netProfit", "归母净利润", "financial", 4, factsByKey, now, 200),
    assessFactField("operatingCashFlow", "经营现金流", "financial", 3, factsByKey, now, 200),
    assessFactField("debtRatio", "资产负债率", "financial", 2, factsByKey, now, 200),
    assessFactField("price", "最新股价", "financial", 1, factsByKey, now, 1),
    assessFactField("peTtm", "市盈率 TTM", "financial", 1, factsByKey, now, 1),
    assessFactField("announcements", "公司公告", "research", 3, factsByKey, now, 45),
    assessFactField("researchReports", "机构研报", "research", 2, factsByKey, now, 90),
    assessProfileField("catalysts", "催化剂", "research", 2, profile?.catalysts, profile, now),
    assessProfileField("risks", "风险因素", "research", 3, profile?.risks, profile, now),
  ];
}

function assessCompanyField(
  fieldKey: string,
  label: string,
  dimension: DimensionId,
  weight: number,
  companyValue: unknown,
  factsByKey: Map<string, CompanyFieldFact[]>,
  now: Date,
  freshnessDays: number,
): FieldAssessment {
  const fact = selectBestAvailableFact(factsByKey.get(fieldKey) ?? []);
  const value = fact?.value ?? companyValue;
  const available = isMeaningfulDossierValue(value);
  const freshness = fact ? getFreshness(fact.fetchedAt, freshnessDays, now) : null;
  return {
    fieldKey,
    label,
    dimension,
    weight,
    available,
    evidenceScore: available ? getFactEvidenceScore(fact) : 0,
    freshnessScore: available ? freshness?.score ?? null : null,
    stale: available ? freshness?.stale ?? false : false,
    fact,
  };
}

function assessFactField(
  fieldKey: string,
  label: string,
  dimension: DimensionId,
  weight: number,
  factsByKey: Map<string, CompanyFieldFact[]>,
  now: Date,
  freshnessDays: number,
): FieldAssessment {
  const fact = selectBestAvailableFact(factsByKey.get(fieldKey) ?? []);
  const available = fact?.status === "available" && isMeaningfulDossierValue(fact.value);
  const freshness = fact ? getFreshness(fact.fetchedAt, freshnessDays, now) : null;
  return {
    fieldKey,
    label,
    dimension,
    weight,
    available,
    evidenceScore: available ? getFactEvidenceScore(fact) : 0,
    freshnessScore: available ? freshness?.score ?? 0 : null,
    stale: available ? freshness?.stale ?? false : false,
    fact,
  };
}

function assessRelationField(relation: DossierRelation | undefined, evidence: Evidence[], now: Date): FieldAssessment {
  const available = Boolean(relation && isMeaningfulDossierValue(relation.categoryName) && isMeaningfulDossierValue(relation.rationale));
  const validEvidence = evidence.filter((item) => !item.isExpired && isMeaningfulDossierValue(item.title));
  const freshestEvidenceDate = validEvidence.map((item) => item.sourceDate).sort().at(-1);
  const freshness = getFreshness(freshestEvidenceDate, 365, now);
  const baseEvidenceScore = !available
    ? 0
    : validEvidence.length > 0
      ? Math.min(100, 65 + (validEvidence.some((item) => item.url) ? 15 : 0) + (validEvidence.some((item) => item.credibility === "高") ? 20 : 0))
      : 20;
  const evidenceScore = available && relation?.verificationStatus === "verified"
    ? Math.min(100, baseEvidenceScore + 10)
    : baseEvidenceScore;
  return {
    fieldKey: "chainPosition",
    label: "产业链位置",
    dimension: "chain",
    weight: 5,
    available,
    evidenceScore,
    freshnessScore: available ? freshness?.score ?? null : null,
    stale: available ? freshness?.stale ?? false : false,
  };
}

function assessProfileField(
  fieldKey: string,
  label: string,
  dimension: DimensionId,
  weight: number,
  value: unknown,
  profile: CompanyResearchProfile | null,
  now: Date,
): FieldAssessment {
  const available = isMeaningfulDossierValue(value);
  const hasSource = isMeaningfulDossierValue(profile?.sourceSummary);
  const freshness = getFreshness(profile?.updatedAt, 180, now);
  return {
    fieldKey,
    label,
    dimension,
    weight,
    available,
    evidenceScore: available ? (hasSource ? 55 : 20) : 0,
    freshnessScore: available ? freshness?.score ?? null : null,
    stale: available ? freshness?.stale ?? false : false,
  };
}

function buildDimensions(assessments: FieldAssessment[]): CompanyDossierQualityDimension[] {
  const definitions: Array<{ id: DimensionId; label: string }> = [
    { id: "identity", label: "基础资料" },
    { id: "business", label: "主营构成" },
    { id: "chain", label: "产业链位置" },
    { id: "financial", label: "财务估值" },
    { id: "research", label: "研究判断" },
  ];

  return definitions.map(({ id, label }) => {
    const fields = assessments.filter((item) => item.dimension === id);
    const score = percent(
      sum(fields.filter((item) => item.available).map((item) => item.weight)),
      sum(fields.map((item) => item.weight)),
    );
    const available = fields.filter((item) => item.available).length;
    return {
      id,
      label,
      score,
      status: score >= 85 ? "complete" : score > 0 ? "partial" : "missing",
      available,
      expected: fields.length,
      detail: `${available}/${fields.length} 项可用`,
    };
  });
}

function buildIssues(
  assessments: FieldAssessment[],
  failedFacts: CompanyFieldFact[],
  conflictedFacts: CompanyFieldFact[],
  snapshots: SourceSnapshot[],
): CompanyDossierQualityIssue[] {
  const issues: CompanyDossierQualityIssue[] = [];
  const assessmentByKey = new Map(assessments.map((item) => [item.fieldKey, item]));

  for (const item of assessments) {
    if (!item.available) {
      const failed = failedFacts.find((fact) => fact.fieldKey === item.fieldKey);
      issues.push({
        fieldKey: item.fieldKey,
        label: item.label,
        status: failed ? "failed" : "missing",
        reason: failed?.error || (failed ? `${failed.providerLabel} 同步失败` : "尚未取得可用数据"),
      });
    } else if (item.stale) {
      issues.push({
        fieldKey: item.fieldKey,
        label: item.label,
        status: "stale",
        reason: "数据已超过建议更新周期",
      });
    } else if (item.evidenceScore < 60) {
      issues.push({
        fieldKey: item.fieldKey,
        label: item.label,
        status: "unverified",
        reason: "已有结论，但来源或验证状态仍不充分",
      });
    }
  }

  for (const fact of conflictedFacts) {
    const definition = assessmentByKey.get(fact.fieldKey);
    issues.unshift({
      fieldKey: fact.fieldKey,
      label: definition?.label ?? fact.fieldKey,
      status: "conflicted",
      reason: fact.error || `${fact.providerLabel} 的数据存在冲突或已被驳回`,
    });
  }

  for (const snapshot of snapshots.filter((item) => item.status === "failed")) {
    issues.push({
      fieldKey: `provider:${snapshot.provider}`,
      label: snapshot.providerLabel,
      status: "failed",
      reason: snapshot.error || "数据源同步失败",
    });
  }

  const priority = { conflicted: 0, failed: 1, missing: 2, stale: 3, unverified: 4 };
  return dedupeIssues(issues).sort((a, b) => priority[a.status] - priority[b.status]);
}

function getFactEvidenceScore(fact: CompanyFieldFact | undefined) {
  if (!fact) return 20;
  if (fact.verificationStatus === "rejected") return 0;
  if (fact.verificationStatus === "conflicted") return 15;
  let score = fact.sourceUrl ? 65 : 40;
  if (fact.confidence === "high") score += 15;
  if (fact.confidence === "medium") score += 8;
  if (fact.verificationStatus === "verified") score += 20;
  return Math.min(100, score);
}

function getFreshness(value: string | undefined, freshnessDays: number, now: Date) {
  const timestamp = parseTimestamp(value);
  if (timestamp === null) return null;
  const ageDays = Math.max(0, (now.getTime() - timestamp) / DAY_MS);
  if (ageDays <= freshnessDays) return { score: 100, stale: false };
  if (ageDays <= freshnessDays * 2) return { score: 55, stale: true };
  return { score: 20, stale: true };
}

function parseTimestamp(value: string | undefined) {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function groupFactsByKey(facts: CompanyFieldFact[]) {
  const grouped = new Map<string, CompanyFieldFact[]>();
  for (const fact of facts) grouped.set(fact.fieldKey, [...(grouped.get(fact.fieldKey) ?? []), fact]);
  return grouped;
}

function selectBestAvailableFact(facts: CompanyFieldFact[]) {
  return [...facts].sort(compareFacts).find((fact) => fact.status === "available" && isMeaningfulDossierValue(fact.value));
}

function compareFacts(a: CompanyFieldFact, b: CompanyFieldFact) {
  const statusRank = { available: 0, failed: 1, missing: 2, skipped: 3 };
  const verificationRank = { verified: 0, unverified: 1, conflicted: 2, rejected: 3 };
  const confidenceRank = { high: 0, medium: 1, low: 2 };
  return (
    statusRank[a.status] - statusRank[b.status] ||
    verificationRank[a.verificationStatus] - verificationRank[b.verificationStatus] ||
    confidenceRank[a.confidence] - confidenceRank[b.confidence] ||
    (parseTimestamp(b.fetchedAt) ?? 0) - (parseTimestamp(a.fetchedAt) ?? 0)
  );
}

function getReliabilityLabel(overall: number, coverage: number, evidence: number, conflicts: number): DossierReliabilityLabel {
  if (coverage < 35) return "资料不足";
  if (conflicts > 0 || evidence < 50) return "待核验";
  if (overall >= 82 && evidence >= 80) return "可靠";
  return "基本可靠";
}

function dedupeIssues(issues: CompanyDossierQualityIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.fieldKey}:${issue.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

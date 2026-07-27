import type { Evidence } from "@/lib/domain/types";
import type { CompanyFieldFact } from "@/lib/repositories/companyFieldFacts";
import type { CompanyResearchProfile } from "@/lib/repositories/researchProfiles";
import type { DossierRelation } from "./companyDossierQuality";
import { isMeaningfulDossierValue, selectBestCompanyFieldFact } from "./companyDossierQuality";

export type CompanyEvidenceTimelineKind = "announcement" | "research_report" | "relation_evidence" | "field_fact" | "research_profile";
export type CompanyEvidenceTimelineStatus = "verified" | "available" | "unverified" | "conflicted" | "failed" | "expired";

export type CompanyEvidenceTimelineItem = {
  id: string;
  kind: CompanyEvidenceTimelineKind;
  kindLabel: string;
  title: string;
  summary: string;
  source: string;
  sourceDate: string;
  timestamp: string;
  url: string;
  credibility: "high" | "medium" | "low";
  status: CompanyEvidenceTimelineStatus;
  statusLabel: string;
  fieldKey: string;
};

export type CompanyEvidenceTimelineInput = {
  relations: DossierRelation[];
  evidenceByRelationId: Record<string | number, Evidence[]>;
  fieldFacts: CompanyFieldFact[];
  researchProfile: CompanyResearchProfile | null;
};

const FIELD_LABELS: Record<string, string> = {
  fullName: "公司全称",
  industry: "所属行业",
  region: "注册地区",
  intro: "公司简介",
  businessScope: "经营范围",
  businessReview: "经营评述",
  mainProducts: "主要产品",
  businessComposition: "主营构成",
  price: "最新股价",
  peTtm: "市盈率 TTM",
  pb: "市净率",
  totalMarketCapYi: "总市值",
  circulatingMarketCapYi: "流通市值",
  revenue: "营业收入",
  revenueYoY: "营业收入同比",
  netProfit: "归母净利润",
  netProfitYoY: "归母净利润同比",
  operatingCashFlow: "经营现金流",
  operatingCashFlowYoY: "经营现金流同比",
  debtRatio: "资产负债率",
  financialReportDate: "财务报告期",
};

export function buildCompanyEvidenceTimeline(input: CompanyEvidenceTimelineInput): CompanyEvidenceTimelineItem[] {
  const items = [
    ...buildDisclosureItems(input.fieldFacts),
    ...buildRelationEvidenceItems(input.relations, input.evidenceByRelationId),
    ...buildFieldFactItems(input.fieldFacts),
    ...buildResearchProfileItems(input.researchProfile),
  ];
  const seen = new Set<string>();

  return items
    .filter((item) => {
      const key = `${item.kind}:${item.title}:${item.sourceDate}:${item.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => {
      const dateComparison = sortableTimestamp(right.timestamp) - sortableTimestamp(left.timestamp);
      return dateComparison || left.kindLabel.localeCompare(right.kindLabel, "zh-CN") || left.title.localeCompare(right.title, "zh-CN");
    });
}

function buildDisclosureItems(fieldFacts: CompanyFieldFact[]) {
  const announcementsFact = selectBestCompanyFieldFact(fieldFacts, "announcements");
  const reportsFact = selectBestCompanyFieldFact(fieldFacts, "researchReports");
  const announcements = objectArray(announcementsFact?.value).flatMap((item, index): CompanyEvidenceTimelineItem[] => {
    const title = stringValue(item.title);
    if (!title) return [];
    const sourceDate = stringValue(item.date);
    return [{
      id: `announcement:${sourceDate}:${index}:${title}`,
      kind: "announcement",
      kindLabel: "公司公告",
      title,
      summary: stringValue(item.type) || "公司公开披露",
      source: announcementsFact?.providerLabel || "巨潮资讯",
      sourceDate,
      timestamp: sourceDate || announcementsFact?.fetchedAt || "",
      url: stringValue(item.url) || announcementsFact?.sourceUrl || "",
      credibility: mapConfidence(announcementsFact?.confidence),
      status: mapFactStatus(announcementsFact),
      statusLabel: mapFactStatusLabel(announcementsFact),
      fieldKey: "announcements",
    }];
  });
  const reports = objectArray(reportsFact?.value).flatMap((item, index): CompanyEvidenceTimelineItem[] => {
    const title = stringValue(item.title);
    if (!title) return [];
    const sourceDate = stringValue(item.publishDate);
    const organization = stringValue(item.organization);
    const rating = stringValue(item.rating);
    return [{
      id: `research-report:${sourceDate}:${index}:${title}`,
      kind: "research_report",
      kindLabel: "机构研报",
      title,
      summary: [organization, rating].filter(Boolean).join(" · ") || "机构研究观点",
      source: organization || reportsFact?.providerLabel || "东方财富研报",
      sourceDate,
      timestamp: sourceDate || reportsFact?.fetchedAt || "",
      url: stringValue(item.pdfUrl) || reportsFact?.sourceUrl || "",
      credibility: mapConfidence(reportsFact?.confidence),
      status: mapFactStatus(reportsFact),
      statusLabel: mapFactStatusLabel(reportsFact),
      fieldKey: "researchReports",
    }];
  });
  return [...announcements, ...reports];
}

function buildRelationEvidenceItems(
  relations: DossierRelation[],
  evidenceByRelationId: Record<string | number, Evidence[]>,
) {
  return relations.flatMap((relation) =>
    (evidenceByRelationId[String(relation.id)] ?? []).map((evidence): CompanyEvidenceTimelineItem => ({
      id: `relation-evidence:${evidence.id}`,
      kind: "relation_evidence",
      kindLabel: "关系证据",
      title: evidence.title,
      summary: [relation.categoryName, relation.relationType, evidence.excerpt].filter(Boolean).join(" · "),
      source: evidence.sourceType,
      sourceDate: evidence.sourceDate,
      timestamp: evidence.sourceDate,
      url: evidence.url,
      credibility: mapChineseCredibility(evidence.credibility),
      status: evidence.isExpired ? "expired" : "verified",
      statusLabel: evidence.isExpired ? "已过期" : "关系佐证",
      fieldKey: "chainPosition",
    })),
  );
}

function buildFieldFactItems(fieldFacts: CompanyFieldFact[]) {
  const aggregateFields = new Set(["announcements", "researchReports"]);
  const uniqueKeys = Array.from(new Set(fieldFacts.map((fact) => fact.fieldKey))).filter((fieldKey) => !aggregateFields.has(fieldKey));
  return uniqueKeys.flatMap((fieldKey): CompanyEvidenceTimelineItem[] => {
    const fact = selectBestCompanyFieldFact(fieldFacts, fieldKey);
    if (!fact || (fact.status !== "available" && fact.status !== "failed") || (fact.status === "available" && !isMeaningfulDossierValue(fact.value))) {
      return [];
    }
    const label = FIELD_LABELS[fieldKey] ?? fieldKey;
    return [{
      id: `field-fact:${fieldKey}:${fact.provider}`,
      kind: "field_fact",
      kindLabel: "字段来源",
      title: fact.status === "failed" ? `${label}同步失败` : `${label}已更新`,
      summary: fact.status === "failed" ? fact.error || "数据源未返回可用结果" : summarizeValue(fact.value),
      source: fact.providerLabel,
      sourceDate: displayDate(fact.fetchedAt),
      timestamp: fact.fetchedAt,
      url: fact.sourceUrl,
      credibility: mapConfidence(fact.confidence),
      status: mapFactStatus(fact),
      statusLabel: mapFactStatusLabel(fact),
      fieldKey,
    }];
  });
}

function buildResearchProfileItems(profile: CompanyResearchProfile | null): CompanyEvidenceTimelineItem[] {
  if (!profile || !isMeaningfulDossierValue(profile.sourceSummary)) return [];
  return [{
    id: `research-profile:${profile.updatedAt}`,
    kind: "research_profile",
    kindLabel: "研究结论",
    title: "结构化研究档案已更新",
    summary: profile.sourceSummary,
    source: "公司研究档案",
    sourceDate: displayDate(profile.updatedAt),
    timestamp: profile.updatedAt,
    url: "",
    credibility: "medium",
    status: "unverified",
    statusLabel: "结论待复核",
    fieldKey: "researchProfile",
  }];
}

function mapFactStatus(fact: CompanyFieldFact | undefined): CompanyEvidenceTimelineStatus {
  if (!fact) return "unverified";
  if (fact.status === "failed") return "failed";
  if (fact.verificationStatus === "conflicted" || fact.verificationStatus === "rejected") return "conflicted";
  if (fact.verificationStatus === "verified") return "verified";
  if (fact.verificationStatus === "unverified") return "unverified";
  return "available";
}

function mapFactStatusLabel(fact: CompanyFieldFact | undefined) {
  const status = mapFactStatus(fact);
  if (status === "verified") return "已核验";
  if (status === "conflicted") return "存在冲突";
  if (status === "failed") return "同步失败";
  if (status === "available") return "来源可用";
  return "待核验";
}

function mapConfidence(value: CompanyFieldFact["confidence"] | undefined): CompanyEvidenceTimelineItem["credibility"] {
  return value === "high" ? "high" : value === "medium" ? "medium" : "low";
}

function mapChineseCredibility(value: Evidence["credibility"]): CompanyEvidenceTimelineItem["credibility"] {
  return value === "高" ? "high" : value === "中" ? "medium" : "low";
}

function summarizeValue(value: unknown) {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
  if (typeof value === "string") return value.length > 90 ? `${value.slice(0, 90)}…` : value;
  if (Array.isArray(value)) return `${value.length} 条结构化记录`;
  if (value && typeof value === "object") return `${Object.keys(value as Record<string, unknown>).length} 个字段`;
  return "数据已入库";
}

function objectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function displayDate(value: string) {
  return value ? value.slice(0, 10) : "";
}

function sortableTimestamp(value: string) {
  if (!value) return 0;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

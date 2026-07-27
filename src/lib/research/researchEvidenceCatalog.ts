import type { CompanyResearchFacts } from "@/lib/agents/deepseekResearchAgent";
import { hasTraceableSourceUrl, isEffectiveEvidence } from "./evidenceTrust";

export type ResearchCitation = {
  id: string;
  title: string;
  sourceType: string;
  sourceDate: string;
  url: string;
  excerpt: string;
  credibility: "高" | "中" | "低";
};

export function buildResearchEvidenceCatalog(facts: CompanyResearchFacts): ResearchCitation[] {
  const citations = new Map<string, ResearchCitation>();

  facts.evidence.forEach((row, index) => {
    if (!isEffectiveEvidence({
      isExpired: booleanOrNumber(row.isExpired),
      verificationStatus: text(row.verificationStatus),
      url: text(row.url),
    })) return;
    const title = text(row.title) || `关系证据 ${index + 1}`;
    addCitation(citations, {
      id: `evidence:${text(row.id) || index + 1}`,
      title,
      sourceType: text(row.sourceType) || "关系证据",
      sourceDate: text(row.sourceDate),
      url: text(row.url),
      excerpt: text(row.excerpt) || title,
      credibility: confidence(row.credibility),
    });
  });

  facts.fieldFacts.forEach((row, index) => {
    if (text(row.status) !== "available") return;
    const verificationStatus = text(row.verificationStatus);
    if (verificationStatus === "conflicted" || verificationStatus === "rejected") return;
    if (verificationStatus !== "verified" && !hasTraceableSourceUrl(text(row.sourceUrl))) return;
    const fieldKey = text(row.fieldKey) || `field-${index + 1}`;
    const provider = text(row.provider) || "字段数据源";
    addCitation(citations, {
      id: `field:${fieldKey}:${slug(provider)}`,
      title: `${fieldKey} · ${provider}`,
      sourceType: "字段事实",
      sourceDate: text(row.fetchedAt),
      url: text(row.sourceUrl),
      excerpt: valueText(row.value),
      credibility: providerConfidence(row.confidence),
    });
  });

  facts.graphRelations.forEach((row, relationIndex) => {
    const previews = Array.isArray(row.evidencePreviews) ? row.evidencePreviews.filter(isRecord) : [];
    previews.forEach((preview, index) => {
      if (!isEffectiveEvidence({
        isExpired: booleanOrNumber(preview.isExpired),
        verificationStatus: text(preview.verificationStatus),
        url: text(preview.url),
      })) return;
      addCitation(citations, {
        id: `graph-evidence:${text(preview.id) || `${relationIndex + 1}-${index + 1}`}`,
        title: text(preview.title) || `${text(row.entityName) || "外部实体"}关系证据`,
        sourceType: text(preview.sourceType) || "图谱证据",
        sourceDate: text(preview.sourceDate),
        url: text(preview.url),
        excerpt: text(preview.excerpt) || text(row.rationale),
        credibility: confidence(preview.credibility),
      });
    });
  });

  return [...citations.values()];
}

function addCitation(map: Map<string, ResearchCitation>, citation: ResearchCitation) {
  if (!citation.excerpt.trim()) return;
  map.set(citation.id, { ...citation, excerpt: citation.excerpt.slice(0, 800) });
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function valueText(value: unknown) {
  if (typeof value === "string") return value.trim();
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function booleanOrNumber(value: unknown) {
  if (value === true || value === false || value === 1 || value === 0) return value;
  return false;
}

function confidence(value: unknown): ResearchCitation["credibility"] {
  return value === "高" || value === "低" ? value : "中";
}

function providerConfidence(value: unknown): ResearchCitation["credibility"] {
  return value === "high" ? "高" : value === "low" ? "低" : "中";
}

function slug(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "") || "source";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

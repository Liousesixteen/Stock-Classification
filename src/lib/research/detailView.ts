import type { Company } from "@/lib/domain/types";
import type { CompanyResearchProfile } from "@/lib/repositories/researchProfiles";

export type DetailRelation = {
  id: number;
  categoryId: number;
  categoryName: string;
  relationType: string;
  confidence: string;
  rationale: string;
  isWatchlist: boolean;
};

export type DetailEvidence = {
  id: number;
  sourceType: string;
  title: string;
  sourceDate: string;
  url: string;
  excerpt: string;
  credibility: string;
};

export type DetailNote = {
  id: number;
  noteType: string;
  content: string;
};

export type CompanyResearchDetailInput = {
  company: Company;
  relations: DetailRelation[];
  evidenceByRelationId: Record<string, DetailEvidence[]>;
  researchProfile: CompanyResearchProfile | null;
  notes: DetailNote[];
};

export type CompanyResearchDetail = {
  code: string;
  name: string;
  industry: string;
  tags: string[];
  researchStatus: "重点跟踪" | "观察" | "待验证" | "排除";
  updatedAt: string;
  oneLiner: string;
  atAGlance: {
    headline: string;
    business: string;
    chain: string;
    relation: string;
    status: string;
  };
  categoryPath: string[];
  relation: {
    type: "已公开披露" | "客户关联" | "产业链共性受益" | "市场概念" | "待核实";
    confidence: "高" | "中高" | "中" | "低";
    reason: string;
  };
  scores: {
    relevance: number;
    performance: number;
    growth: number;
    risk: number;
  };
  businessSegments: Array<{
    name: string;
    exposure: "高" | "较高" | "中" | "低" | "待确认";
    revenueRatio?: number;
    grossMargin?: number;
    note: string;
  }>;
  catalysts: Array<{ title: string; type: string; status: "未发生" | "进行中" | "已发生"; note: string }>;
  risks: Array<{ content: string; level: "高" | "中" | "低"; category: string }>;
  evidence: DetailEvidence[];
  note: { id?: number; content: string; updatedBy: "user" | "ai" };
};

export function buildCompanyResearchDetail(input: CompanyResearchDetailInput): CompanyResearchDetail {
  const { company, relations, evidenceByRelationId, researchProfile, notes } = input;
  const primaryRelation = relations[0];
  const primaryEvidence = primaryRelation ? (evidenceByRelationId[String(primaryRelation.id)] ?? []) : [];
  const allEvidence = relations.flatMap((relation) => evidenceByRelationId[String(relation.id)] ?? []);
  const businessSegments = buildBusinessSegments(company, researchProfile);
  const relationType = mapRelationType(primaryRelation, primaryEvidence.length);
  const researchStatus = mapResearchStatus(primaryRelation, primaryEvidence.length);
  const oneLiner = buildOneLiner(company, researchProfile, primaryRelation);
  const note = findUserNote(notes);

  return {
    code: company.stockCode,
    name: company.shortName,
    industry: company.industry || "行业待补",
    tags: uniqueNonEmpty([company.industry, primaryRelation?.categoryName, researchStatus, primaryRelation?.isWatchlist ? "待复核" : ""]),
    researchStatus,
    updatedAt: researchProfile?.updatedAt || company.updatedAt,
    oneLiner,
    atAGlance: buildAtAGlance(company, primaryRelation, businessSegments, oneLiner, researchStatus),
    categoryPath: primaryRelation ? [primaryRelation.categoryName] : ["当前分类待选择"],
    relation: {
      type: relationType,
      confidence: mapConfidence(primaryRelation?.confidence),
      reason: primaryRelation?.rationale || "暂无归类理由，建议同步资料或补充证据。",
    },
    scores: {
      relevance: scoreRelevance(primaryRelation, primaryEvidence.length),
      performance: scorePerformance(businessSegments),
      growth: scoreGrowth(researchProfile),
      risk: scoreRisk(primaryRelation, researchProfile),
    },
    businessSegments,
    catalysts: buildCatalysts(researchProfile),
    risks: buildRisks(primaryRelation, researchProfile),
    evidence: allEvidence,
    note: {
      id: note?.id,
      content: note?.content || "",
      updatedBy: note ? "user" : "ai",
    },
  };
}

function buildAtAGlance(
  company: Company,
  relation: DetailRelation | undefined,
  segments: CompanyResearchDetail["businessSegments"],
  oneLiner: string,
  researchStatus: CompanyResearchDetail["researchStatus"],
): CompanyResearchDetail["atAGlance"] {
  const business = uniqueNonEmpty(segments.map((segment) => cleanBusinessName(segment.name))).slice(0, 3).join("、") || `${company.industry || "待补行业"}相关业务`;
  const chain = relation?.categoryName || "分类待选择";
  const relationSummary = relation ? `${relation.relationType} · ${relation.confidence}` : "待验证 · 低";
  return {
    headline: oneLiner,
    business,
    chain,
    relation: relationSummary,
    status: researchStatus,
  };
}

function buildOneLiner(company: Company, researchProfile: CompanyResearchProfile | null, relation: DetailRelation | undefined) {
  const summary = firstSentence(researchProfile?.summary || company.intro);
  if (summary && !isPlaceholderSummary(summary, company.shortName)) return summary;
  const coreBusiness = firstSentence(company.mainBusiness);
  const category = relation?.categoryName ? `，当前归类于${relation.categoryName}` : "";
  return `${company.shortName}属于${company.industry || "待补行业"}${coreBusiness ? `，核心业务为${coreBusiness}` : ""}${category}。`;
}

function isPlaceholderSummary(value: string, shortName: string) {
  return /本地索引|本地股票索引|结构化资料待补|资料待补/.test(value) || value === `${shortName}。`;
}

function buildBusinessSegments(company: Company, researchProfile: CompanyResearchProfile | null): CompanyResearchDetail["businessSegments"] {
  const lines =
    researchProfile?.businessLines && researchProfile.businessLines.length > 0
      ? researchProfile.businessLines
      : [{ name: company.industry ? `${company.industry}相关业务` : "核心业务待补", share: "占比待补", grossMargin: "毛利率待补" }];

  return lines.map((line) => {
    const revenueRatio = parsePercent(line.share);
    const grossMargin = parsePercent(line.grossMargin);
    return {
      name: line.name,
      exposure: mapExposure(revenueRatio, line.share),
      revenueRatio,
      grossMargin,
      note: `收入占比：${line.share || "占比待补"}；毛利率：${line.grossMargin || "毛利率待补"}`,
    };
  });
}

function buildCatalysts(researchProfile: CompanyResearchProfile | null): CompanyResearchDetail["catalysts"] {
  const items = researchProfile?.catalysts.length ? researchProfile.catalysts : ["业务收入占比、毛利率与订单变化待跟踪"];
  return items.map((title) => ({
    title,
    type: inferCatalystType(title),
    status: "未发生",
    note: "待跟踪",
  }));
}

function buildRisks(relation: DetailRelation | undefined, researchProfile: CompanyResearchProfile | null): CompanyResearchDetail["risks"] {
  const base = researchProfile?.risks.length ? researchProfile.risks : ["相关业务收入占比、订单兑现和证据来源仍需持续验证"];
  const relationRisk = relation?.isWatchlist || relation?.confidence === "低" ? ["当前分类关系仍需复核"] : [];
  return [...relationRisk, ...base].slice(0, 5).map((content) => ({
    content,
    level: /高风险|大幅|失败|重大|低/.test(content) ? "高" : "中",
    category: inferRiskCategory(content),
  }));
}

function findUserNote(notes: DetailNote[]) {
  return notes.find((note) => note.noteType === "我的备注") ?? notes[0];
}

function mapRelationType(relation: DetailRelation | undefined, evidenceCount: number): CompanyResearchDetail["relation"]["type"] {
  if (!relation) return "待核实";
  if (relation.relationType === "待验证" || relation.confidence === "低") return "待核实";
  if (/概念|少量/.test(relation.relationType)) return "市场概念";
  if (relation.relationType === "主营业务" && evidenceCount > 0) return "已公开披露";
  if (/客户|供货|配套/.test(relation.rationale)) return "客户关联";
  return "产业链共性受益";
}

function mapResearchStatus(relation: DetailRelation | undefined, evidenceCount: number): CompanyResearchDetail["researchStatus"] {
  if (!relation || relation.isWatchlist || relation.relationType === "待验证" || relation.confidence === "低") return "待验证";
  if (relation.relationType === "主营业务" && relation.confidence === "高" && evidenceCount > 0) return "重点跟踪";
  return "观察";
}

function mapConfidence(value: string | undefined): CompanyResearchDetail["relation"]["confidence"] {
  if (value === "高") return "高";
  if (value === "中") return "中";
  return "低";
}

function scoreRelevance(relation: DetailRelation | undefined, evidenceCount: number) {
  if (!relation) return 1;
  if (relation.relationType === "主营业务" && relation.confidence === "高") return evidenceCount > 0 ? 5 : 4;
  if (relation.confidence === "中") return 3;
  return 2;
}

function scorePerformance(segments: CompanyResearchDetail["businessSegments"]) {
  if (segments.some((segment) => typeof segment.revenueRatio === "number" && segment.revenueRatio >= 50)) return 4;
  if (segments.some((segment) => typeof segment.revenueRatio === "number" && segment.revenueRatio >= 20)) return 3;
  return 2;
}

function scoreGrowth(researchProfile: CompanyResearchProfile | null) {
  if (!researchProfile?.catalysts.length) return 2;
  return researchProfile.catalysts.some((item) => /待跟踪|待补/.test(item)) ? 3 : 4;
}

function scoreRisk(relation: DetailRelation | undefined, researchProfile: CompanyResearchProfile | null) {
  if (!relation || relation.isWatchlist || relation.confidence === "低") return 4;
  if ((researchProfile?.risks.length ?? 0) >= 3) return 4;
  return 3;
}

function mapExposure(ratio: number | undefined, rawShare: string): CompanyResearchDetail["businessSegments"][number]["exposure"] {
  if (typeof ratio !== "number") return rawShare.includes("待") ? "待确认" : "中";
  if (ratio >= 50) return "高";
  if (ratio >= 20) return "较高";
  if (ratio >= 5) return "中";
  return "低";
}

function inferCatalystType(value: string) {
  if (/订单|客户/.test(value)) return "订单进展";
  if (/财报|收入|毛利|利润/.test(value)) return "财报验证";
  if (/政策/.test(value)) return "政策催化";
  if (/首飞|型号|验证|量产/.test(value)) return "型号进展";
  return "其他";
}

function inferRiskCategory(value: string) {
  if (/订单/.test(value)) return "订单风险";
  if (/客户/.test(value)) return "客户风险";
  if (/收入|利润|业绩|占比/.test(value)) return "业绩风险";
  if (/技术|研发/.test(value)) return "技术风险";
  if (/概念|核实|证据/.test(value)) return "概念风险";
  return "其他";
}

function parsePercent(value: string) {
  const match = value.match(/(\d+(?:\.\d+)?)%/);
  return match ? Number(match[1]) : undefined;
}

function firstSentence(value: string | undefined) {
  return (value ?? "").split(/[。；;\n]/).map((item) => item.trim()).find(Boolean) ?? "";
}

function uniqueNonEmpty(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => (value ?? "").trim()).filter(Boolean)));
}

function cleanBusinessName(value: string) {
  return value
    .replace(/^(主营构成|主营业务|核心业务|东财行业|相关概念)[:：]/, "")
    .replace(/相关业务$/, "相关业务")
    .trim();
}

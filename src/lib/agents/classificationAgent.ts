import type { StockLookupProfile } from "@/lib/datasources/stockLookup";
import type { CategoryNode, ConfidenceLevel, RelationType, SourceType } from "@/lib/domain/types";
import { buildResearchProfileDraft } from "@/lib/research/profileBuilder";
import type { CompanyResearchProfileInput } from "@/lib/repositories/researchProfiles";

export type ClassificationAgentInput = {
  profile: StockLookupProfile;
  category: Pick<CategoryNode, "name" | "aliases" | "description" | "industry">;
};

export type ClassificationAgentResult = {
  relationType: RelationType;
  confidence: ConfidenceLevel;
  rationale: string;
  sourceFacts: string[];
  companyProfilePatch: Partial<
    Pick<StockLookupProfile, "board" | "industry" | "region" | "marketCapBand" | "intro" | "mainBusiness">
  > & { fullName?: string };
  evidence: {
    sourceType: SourceType;
    title: string;
    sourceDate: string;
    url: string;
    excerpt: string;
    credibility: ConfidenceLevel;
  };
  researchProfilePatch: Omit<CompanyResearchProfileInput, "stockCode">;
  agentName: "rules-classification-agent" | "deepseek-classification-agent";
  agentVersion: string;
  model?: string;
};

const DOMAIN_SIGNAL_TERMS: Record<string, string[]> = {
  创新药: ["创新药", "制药", "生物制品", "医药", "药业", "肿瘤", "治疗", "adc"],
  机器人: ["机器人", "自动化", "运动控制", "伺服", "减速器", "传感", "智能制造", "机器视觉"],
  商业航天: ["商业航天", "航天", "卫星", "军工", "北斗", "连接器", "宇航", "通信"],
  证券: ["证券", "券商", "投行", "财富管理", "金融"],
  半导体: ["半导体", "集成电路", "电子材料", "电子化学品", "设备", "封测", "晶圆"],
};

const CATEGORY_KEY_TERMS = [
  "光刻胶",
  "显影液",
  "剥离液",
  "CMP",
  "抛光垫",
  "高纯溶剂",
  "电子材料",
  "电子化学品",
  "半导体材料",
  "硅晶圆",
  "硅片",
  "封测",
  "测试",
  "机器人",
  "创新药",
  "商业航天",
  "证券",
];

export function organizeStockFacts(input: ClassificationAgentInput): ClassificationAgentResult {
  const { profile, category } = input;
  const categoryTerms = collectDirectCategoryTerms(category);
  const contextTerms = collectContextTerms(category);
  const factText = normalizeText(
    [
      profile.shortName,
      profile.fullName,
      profile.industry,
      profile.board,
      profile.intro,
      profile.mainBusiness,
      profile.businessScope,
      profile.businessReview,
      profile.concepts.join(" "),
      profile.industryBlocks.join(" "),
      profile.mainProducts.join(" "),
      profile.sourceFacts.join(" "),
    ].join(" "),
  );
  const directMatches = categoryTerms.filter((term) => term && factText.includes(normalizeText(term)));
  const signalMatches = uniqueFacts([...getDomainSignalTerms(category.name), ...contextTerms]).filter((term) =>
    factText.includes(normalizeText(term)),
  );
  const sourceFacts = buildSourceFacts(profile);

  if (directMatches.length > 0) {
    return buildResult({
      profile,
      categoryName: category.name,
      relationType: "主营业务",
      confidence: "高",
      basis: `当前基础资料直接命中「${directMatches.slice(0, 2).join("、")}」`,
      sourceFacts,
      needsEvidence: false,
    });
  }

  if (signalMatches.length > 0) {
    return buildResult({
      profile,
      categoryName: category.name,
      relationType: "重要相关",
      confidence: "中",
      basis: `当前基础资料命中主题信号「${signalMatches.slice(0, 2).join("、")}」`,
      sourceFacts,
      needsEvidence: true,
    });
  }

  return {
    relationType: "待验证",
    confidence: "低",
    rationale: `纳入「${category.name}」待验证：${profile.shortName}暂未从当前基础资料中识别到与该方向的直接关系，后续需要补充公告、年报或研报证据。`,
    sourceFacts,
    companyProfilePatch: buildCompanyProfilePatch(profile, category.name),
    evidence: buildEvidence(profile, "低", sourceFacts),
    researchProfilePatch: buildAgentResearchProfilePatch({
      profile,
      categoryName: category.name,
      relationType: "待验证",
      confidence: "低",
      rationale: `纳入「${category.name}」待验证：${profile.shortName}暂未从当前基础资料中识别到与该方向的直接关系，后续需要补充公告、年报或研报证据。`,
    }),
    agentName: "rules-classification-agent",
    agentVersion: "0.1.0",
  };
}

function buildResult(input: {
  profile: StockLookupProfile;
  categoryName: string;
  relationType: RelationType;
  confidence: ConfidenceLevel;
  basis: string;
  sourceFacts: string[];
  needsEvidence: boolean;
}): ClassificationAgentResult {
  const descriptor = [input.profile.industry, input.profile.board].filter(Boolean).join(" / ");
  const evidenceTail = input.needsEvidence ? "，后续需要补充公告、年报或研报证据。" : "，可继续补充公告、年报或研报证据。";
  return {
    relationType: input.relationType,
    confidence: input.confidence,
    rationale: `纳入「${input.categoryName}」：${input.profile.shortName}${descriptor ? `（${descriptor}）` : ""}，${input.basis}${evidenceTail}`,
    sourceFacts: input.sourceFacts,
    companyProfilePatch: buildCompanyProfilePatch(input.profile, input.categoryName),
    evidence: buildEvidence(input.profile, input.confidence, input.sourceFacts),
    researchProfilePatch: buildAgentResearchProfilePatch({
      profile: input.profile,
      categoryName: input.categoryName,
      relationType: input.relationType,
      confidence: input.confidence,
      rationale: `纳入「${input.categoryName}」：${input.profile.shortName}，${input.basis}`,
    }),
    agentName: "rules-classification-agent",
    agentVersion: "0.1.0",
  };
}

function collectDirectCategoryTerms(category: Pick<CategoryNode, "name" | "aliases" | "description" | "industry">) {
  const rawTerms = [category.name, ...category.aliases]
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !["当前分类", "其他"].includes(term));
  const categoryText = normalizeText(rawTerms.join(" "));
  const extractedKeyTerms = CATEGORY_KEY_TERMS.filter((term) => categoryText.includes(normalizeText(term)));
  return Array.from(new Set([...rawTerms, ...extractedKeyTerms]));
}

function collectContextTerms(category: Pick<CategoryNode, "name" | "aliases" | "description" | "industry">) {
  const rawTerms = [category.industry, category.description]
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !["当前分类", "其他"].includes(term));
  const contextText = normalizeText(rawTerms.join(" "));
  const extractedKeyTerms = CATEGORY_KEY_TERMS.filter((term) => contextText.includes(normalizeText(term)));
  return Array.from(new Set([...rawTerms, ...extractedKeyTerms]));
}

function getDomainSignalTerms(categoryName: string) {
  const normalizedCategoryName = normalizeText(categoryName);
  const matchedKey = Object.keys(DOMAIN_SIGNAL_TERMS).find((key) => normalizedCategoryName.includes(normalizeText(key)));
  return matchedKey ? DOMAIN_SIGNAL_TERMS[matchedKey] : [];
}

function buildSourceFacts(profile: StockLookupProfile) {
  return uniqueFacts([
    `代码：${profile.stockCode}`,
    `简称：${profile.shortName}`,
    profile.industry ? `行业：${profile.industry}` : "",
    profile.board ? `上市板块：${profile.board}` : "",
    profile.region ? `地域板块：${profile.region}` : "",
    profile.marketCapBand ? `市值区间：${profile.marketCapBand}` : "",
    profile.concepts.length > 0 ? `概念板块：${profile.concepts.slice(0, 10).join("、")}` : "",
    profile.mainProducts.length > 0 ? `主营构成：${profile.mainProducts.slice(0, 8).join("、")}` : "",
    profile.sourceDetail ? `数据源：${profile.sourceDetail}` : "",
    ...profile.sourceFacts,
  ].filter(Boolean));
}

function buildCompanyProfilePatch(profile: StockLookupProfile, categoryName: string): ClassificationAgentResult["companyProfilePatch"] {
  const positionFragments = [
    profile.mainBusiness,
    profile.concepts.length > 0 ? `产业链/概念标签：${profile.concepts.slice(0, 10).join("、")}` : "",
    categoryName ? `当前归类方向：${categoryName}` : "",
  ].filter(Boolean);

  return {
    fullName: profile.fullName,
    board: profile.board,
    industry: profile.industry,
    region: profile.region,
    marketCapBand: profile.marketCapBand,
    intro: profile.intro,
    mainBusiness: uniqueFacts(positionFragments).join("；"),
  };
}

function buildEvidence(profile: StockLookupProfile, confidence: ConfidenceLevel, sourceFacts: string[]): ClassificationAgentResult["evidence"] {
  return {
    sourceType: "网页",
    title: `自动同步资料：${profile.shortName}`,
    sourceDate: "",
    url: "",
    excerpt: `${sourceFacts.slice(0, 12).join("；")}。`,
    credibility: confidence,
  };
}

function buildAgentResearchProfilePatch(input: {
  profile: StockLookupProfile;
  categoryName: string;
  relationType: RelationType;
  confidence: ConfidenceLevel;
  rationale: string;
}): ClassificationAgentResult["researchProfilePatch"] {
  const profilePatch = buildResearchProfileDraft({
    stockCode: input.profile.stockCode,
    shortName: input.profile.shortName,
    industry: input.profile.industry,
    intro: input.profile.intro,
    mainBusiness:
      input.profile.mainProducts.length > 0
        ? input.profile.mainProducts.join("、")
        : (buildCompanyProfilePatch(input.profile, input.categoryName).mainBusiness ?? input.profile.mainBusiness),
    relations: [
      {
        categoryName: input.categoryName,
        relationType: input.relationType,
        confidence: input.confidence,
        rationale: input.rationale,
      },
    ],
    evidenceTitles: [`自动同步资料：${input.profile.shortName}`],
  });
  return {
    summary: profilePatch.summary,
    businessLines: profilePatch.businessLines,
    chainPosition: profilePatch.chainPosition,
    competitiveAdvantages: profilePatch.competitiveAdvantages,
    keyCustomers: profilePatch.keyCustomers,
    catalysts: profilePatch.catalysts,
    risks: profilePatch.risks,
    sourceSummary: profilePatch.sourceSummary,
  };
}

function uniqueFacts(facts: string[]) {
  return Array.from(new Set(facts.map((fact) => fact.trim()).filter(Boolean)));
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

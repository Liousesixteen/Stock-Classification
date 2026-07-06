import type { StockLookupProfile } from "@/lib/datasources/stockLookup";
import type { CategoryNode, ConfidenceLevel, RelationType } from "@/lib/domain/types";

export type ClassificationAgentInput = {
  profile: StockLookupProfile;
  category: Pick<CategoryNode, "name" | "aliases" | "description" | "industry">;
};

export type ClassificationAgentResult = {
  relationType: RelationType;
  confidence: ConfidenceLevel;
  rationale: string;
  sourceFacts: string[];
  agentName: "rules-classification-agent";
  agentVersion: "0.1.0";
};

const DOMAIN_SIGNAL_TERMS: Record<string, string[]> = {
  创新药: ["创新药", "制药", "生物制品", "医药", "药业", "肿瘤", "治疗", "adc"],
  机器人: ["机器人", "自动化", "运动控制", "伺服", "减速器", "传感", "智能制造", "机器视觉"],
  商业航天: ["商业航天", "航天", "卫星", "军工", "北斗", "连接器", "宇航", "通信"],
  证券: ["证券", "券商", "投行", "财富管理", "金融"],
  半导体: ["半导体", "集成电路", "电子材料", "电子化学品", "设备", "封测", "晶圆"],
};

export function organizeStockFacts(input: ClassificationAgentInput): ClassificationAgentResult {
  const { profile, category } = input;
  const categoryTerms = collectCategoryTerms(category);
  const factText = normalizeText([profile.shortName, profile.industry, profile.board, profile.intro, profile.mainBusiness].join(" "));
  const directMatches = categoryTerms.filter((term) => term && factText.includes(normalizeText(term)));
  const signalMatches = getDomainSignalTerms(category.name).filter((term) => factText.includes(normalizeText(term)));
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
    agentName: "rules-classification-agent",
    agentVersion: "0.1.0",
  };
}

function collectCategoryTerms(category: Pick<CategoryNode, "name" | "aliases" | "description" | "industry">) {
  return [category.name, category.industry, ...category.aliases]
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !["当前分类", "其他"].includes(term));
}

function getDomainSignalTerms(categoryName: string) {
  const normalizedCategoryName = normalizeText(categoryName);
  const matchedKey = Object.keys(DOMAIN_SIGNAL_TERMS).find((key) => normalizedCategoryName.includes(normalizeText(key)));
  return matchedKey ? DOMAIN_SIGNAL_TERMS[matchedKey] : [];
}

function buildSourceFacts(profile: StockLookupProfile) {
  return [
    `代码：${profile.stockCode}`,
    `简称：${profile.shortName}`,
    profile.industry ? `行业：${profile.industry}` : "",
    profile.board ? `上市板块：${profile.board}` : "",
    profile.marketCapBand ? `市值区间：${profile.marketCapBand}` : "",
    profile.sourceDetail ? `数据源：${profile.sourceDetail}` : "",
  ].filter(Boolean);
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

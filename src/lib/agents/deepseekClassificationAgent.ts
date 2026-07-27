import { CONFIDENCE_LEVELS, RELATION_TYPES, SOURCE_TYPES } from "@/lib/domain/constants";
import type { ClassificationAgentInput, ClassificationAgentResult } from "./classificationAgent";
import { organizeStockFacts } from "./classificationAgent";

type DeepSeekConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
};

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

type ParsedAgentOutput = {
  relationType?: unknown;
  confidence?: unknown;
  rationale?: unknown;
  sourceFacts?: unknown;
  companyProfilePatch?: unknown;
  evidence?: unknown;
  researchProfilePatch?: unknown;
};

type AgentFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-v4-flash";

export async function organizeStockFactsWithDeepSeek(
  input: ClassificationAgentInput,
  config: DeepSeekConfig = {},
  fetcher: AgentFetcher = fetch,
): Promise<ClassificationAgentResult> {
  const apiKey = config.apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DeepSeek API key 未配置");
  }

  const baseUrl = trimTrailingSlash(config.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL);
  const model = config.model ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL;
  const timeoutMs = Math.max(1_000, Math.min(config.timeoutMs ?? 20_000, 60_000));
  const fallback = organizeStockFacts(input);
  const response = await fetcher(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      messages: buildMessages(input, fallback),
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 1200,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek Agent 调用失败：${response.status}`);
  }

  const payload = (await response.json()) as DeepSeekResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("DeepSeek Agent 未返回内容");
  }

  const parsed = JSON.parse(content) as ParsedAgentOutput;
  return normalizeAgentOutput(parsed, fallback, model);
}

function buildMessages(input: ClassificationAgentInput, fallback: ClassificationAgentResult) {
  return [
    {
      role: "system",
      content:
        "你是A股产业链分类研究助理。只允许基于用户提供的事实做判断，不要编造未给出的事实；缺少占比、毛利率、客户等事实时必须写“占比待补”“毛利率待补”“客户待补”。请输出严格 json，字段为 relationType、confidence、rationale、sourceFacts、companyProfilePatch、evidence、researchProfilePatch。relationType 必须是 主营业务/重要相关/概念/少量布局/待验证 之一；confidence 必须是 高/中/低 之一；companyProfilePatch 只能包含 fullName、board、industry、region、marketCapBand、intro、mainBusiness；evidence.sourceType 必须是 年报/公告/互动易/研报/网页/手动备注/其他 之一；researchProfilePatch 必须包含 summary、businessLines、chainPosition、competitiveAdvantages、keyCustomers、catalysts、risks、sourceSummary。",
    },
    {
      role: "user",
      content: JSON.stringify({
        category: input.category,
        stockFacts: input.profile,
        allowedRelationTypes: RELATION_TYPES,
        allowedConfidenceLevels: CONFIDENCE_LEVELS,
        localRuleSuggestion: fallback,
        jsonExample: {
          relationType: "重要相关",
          confidence: "中",
          rationale: "纳入某分类：公司简称（行业 / 板块），基于给定事实判断与该方向相关，后续需要补充公告、年报或研报证据。",
          sourceFacts: ["代码：000000", "行业：示例行业"],
          companyProfilePatch: {
            intro: "基于给定事实整理的一句话公司简介。",
            mainBusiness: "东财行业：示例行业；相关概念：示例概念；当前归类方向：示例分类。",
          },
          evidence: {
            sourceType: "网页",
            title: "自动同步资料：示例公司",
            sourceDate: "",
            url: "",
            excerpt: "代码：000000；行业：示例行业；概念板块：示例概念。",
            credibility: "中",
          },
          researchProfilePatch: {
            summary: "示例公司基于给定事实整理的一句话研究摘要。",
            businessLines: [{ name: "示例业务", share: "占比待补", grossMargin: "毛利率待补" }],
            chainPosition: ["当前细分：示例分类"],
            competitiveAdvantages: ["优势待补"],
            keyCustomers: ["客户待补"],
            catalysts: ["业务收入占比、毛利率与订单变化待跟踪"],
            risks: ["行业周期、价格波动与客户集中度风险待评估"],
            sourceSummary: "基于给定事实和本地规则整理",
          },
        },
      }),
    },
  ];
}

function normalizeAgentOutput(
  parsed: ParsedAgentOutput,
  fallback: ClassificationAgentResult,
  model: string,
): ClassificationAgentResult {
  const parsedRelationType = RELATION_TYPES.find((candidate) => candidate === parsed.relationType);
  const shouldDowngradeMainBusiness = parsedRelationType === "主营业务" && fallback.relationType !== "主营业务";
  const relationType = shouldDowngradeMainBusiness ? fallback.relationType : (parsedRelationType ?? fallback.relationType);
  const confidence = shouldDowngradeMainBusiness
    ? fallback.confidence
    : (CONFIDENCE_LEVELS.find((candidate) => candidate === parsed.confidence) ?? fallback.confidence);
  const rationale =
    shouldDowngradeMainBusiness || typeof parsed.rationale !== "string" || !parsed.rationale.trim()
      ? fallback.rationale
      : parsed.rationale.trim();
  const sourceFacts =
    Array.isArray(parsed.sourceFacts) && parsed.sourceFacts.every((fact) => typeof fact === "string")
      ? parsed.sourceFacts
      : fallback.sourceFacts;
  const companyProfilePatch = normalizeCompanyProfilePatch(parsed.companyProfilePatch, fallback);
  const evidence = normalizeEvidence(parsed.evidence, fallback, confidence);
  const researchProfilePatch = normalizeResearchProfilePatch(parsed.researchProfilePatch, fallback);

  return {
    relationType,
    confidence,
    rationale,
    sourceFacts,
    companyProfilePatch,
    evidence,
    researchProfilePatch,
    agentName: "deepseek-classification-agent",
    agentVersion: "0.1.0",
    model,
  };
}

function normalizeCompanyProfilePatch(
  value: unknown,
  fallback: ClassificationAgentResult,
): ClassificationAgentResult["companyProfilePatch"] {
  if (!isRecord(value)) return fallback.companyProfilePatch;

  return {
    fullName: normalizeOptionalString(value.fullName) || fallback.companyProfilePatch.fullName,
    board: normalizeOptionalString(value.board) || fallback.companyProfilePatch.board,
    industry: normalizeOptionalString(value.industry) || fallback.companyProfilePatch.industry,
    region: normalizeOptionalString(value.region) || fallback.companyProfilePatch.region,
    marketCapBand: normalizeOptionalString(value.marketCapBand) || fallback.companyProfilePatch.marketCapBand,
    intro: normalizeOptionalString(value.intro) || fallback.companyProfilePatch.intro,
    mainBusiness: normalizeOptionalString(value.mainBusiness) || fallback.companyProfilePatch.mainBusiness,
  };
}

function normalizeEvidence(
  value: unknown,
  fallback: ClassificationAgentResult,
  confidence: ClassificationAgentResult["confidence"],
): ClassificationAgentResult["evidence"] {
  if (!isRecord(value)) return { ...fallback.evidence, credibility: confidence };

  const sourceType = SOURCE_TYPES.find((candidate) => candidate === value.sourceType) ?? fallback.evidence.sourceType;
  const credibility = CONFIDENCE_LEVELS.find((candidate) => candidate === value.credibility) ?? confidence;

  return {
    sourceType,
    title: normalizeOptionalString(value.title) || fallback.evidence.title,
    sourceDate: normalizeOptionalString(value.sourceDate) || fallback.evidence.sourceDate,
    url: normalizeOptionalString(value.url) || fallback.evidence.url,
    excerpt: normalizeOptionalString(value.excerpt) || fallback.evidence.excerpt,
    credibility,
  };
}

function normalizeResearchProfilePatch(
  value: unknown,
  fallback: ClassificationAgentResult,
): ClassificationAgentResult["researchProfilePatch"] {
  if (!isRecord(value)) return fallback.researchProfilePatch;

  const businessLines = Array.isArray(value.businessLines)
    ? value.businessLines
        .filter(isRecord)
        .map((line) => ({
          name: normalizeOptionalString(line.name),
          share: normalizeOptionalString(line.share) || "占比待补",
          grossMargin: normalizeOptionalString(line.grossMargin) || "毛利率待补",
        }))
        .filter((line) => line.name)
    : fallback.researchProfilePatch.businessLines;

  return {
    summary: normalizeOptionalString(value.summary) || fallback.researchProfilePatch.summary,
    businessLines: businessLines.length > 0 ? businessLines : fallback.researchProfilePatch.businessLines,
    chainPosition: normalizeStringList(value.chainPosition, fallback.researchProfilePatch.chainPosition),
    competitiveAdvantages: normalizeStringList(value.competitiveAdvantages, fallback.researchProfilePatch.competitiveAdvantages),
    keyCustomers: normalizeStringList(value.keyCustomers, fallback.researchProfilePatch.keyCustomers),
    catalysts: normalizeStringList(value.catalysts, fallback.researchProfilePatch.catalysts),
    risks: normalizeStringList(value.risks, fallback.researchProfilePatch.risks),
    sourceSummary: normalizeOptionalString(value.sourceSummary) || fallback.researchProfilePatch.sourceSummary,
  };
}

function normalizeStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const normalized = value.map(normalizeOptionalString).filter(Boolean);
  return normalized.length > 0 ? normalized : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

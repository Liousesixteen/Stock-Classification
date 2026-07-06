import { CONFIDENCE_LEVELS, RELATION_TYPES } from "@/lib/domain/constants";
import type { ClassificationAgentInput, ClassificationAgentResult } from "./classificationAgent";
import { organizeStockFacts } from "./classificationAgent";

type DeepSeekConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
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
  const fallback = organizeStockFacts(input);
  const response = await fetcher(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: buildMessages(input, fallback),
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 800,
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
        "你是A股产业链分类研究助理。只允许基于用户提供的事实做判断，不要编造未给出的事实。请输出严格 json，字段为 relationType、confidence、rationale、sourceFacts。relationType 必须是 主营业务/重要相关/概念/少量布局/待验证 之一；confidence 必须是 高/中/低 之一。",
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
  const relationType = RELATION_TYPES.find((candidate) => candidate === parsed.relationType) ?? fallback.relationType;
  const confidence = CONFIDENCE_LEVELS.find((candidate) => candidate === parsed.confidence) ?? fallback.confidence;
  const rationale = typeof parsed.rationale === "string" && parsed.rationale.trim() ? parsed.rationale.trim() : fallback.rationale;
  const sourceFacts =
    Array.isArray(parsed.sourceFacts) && parsed.sourceFacts.every((fact) => typeof fact === "string")
      ? parsed.sourceFacts
      : fallback.sourceFacts;

  return {
    relationType,
    confidence,
    rationale,
    sourceFacts,
    agentName: "deepseek-classification-agent",
    agentVersion: "0.1.0",
    model,
  };
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

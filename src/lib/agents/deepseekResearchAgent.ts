import { buildResearchEvidenceCatalog, type ResearchCitation } from "@/lib/research/researchEvidenceCatalog";
import { inferResearchSourceScenario } from "@/lib/research/researchSourceDirectory";
import type {
  ResearchReportChart,
  ResearchReportQuality,
  ResearchReportType,
} from "@/lib/repositories/researchDocuments";
import { createResearchProgressEvent, type ResearchProgressEvent } from "@/lib/research/researchProgress";
import { createReportProgress, type ReportGenerationProgress } from "@/lib/research/reportGenerationProgress";
import { reportOutlineForType } from "@/lib/finsight/reportPlanner";
import { sanitizePublicReportText } from "@/lib/research/publicReportBrand";
import {
  buildFallbackResearchPlan,
  normalizeResearchPlan,
  researchPlanOutputSchema,
  type ResearchAnswerBlock,
  type ResearchAnswerMetric,
  type ResearchPlan,
  type ResearchPlanTask,
} from "@/lib/research/researchPlanning";
import { resolveResearchSkills, type ResearchSkill } from "./researchSkills";
import { buildDAStockToolTrace } from "./daStockResearchTools";

type DeepSeekConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

type DeepSeekResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

class ResearchModelOutputError extends Error {
  constructor(readonly finishReason = "") {
    super("模型返回的结构化结果不完整，自动重试后仍无法解析");
    this.name = "ResearchModelOutputError";
  }
}

export type CompanyResearchFacts = {
  subject?: { kind: "company" | "industry" | "question"; label: string; key: string };
  company: Record<string, unknown>;
  relations: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  researchProfile: Record<string, unknown> | null;
  fieldFacts: Array<Record<string, unknown>>;
  dossierQuality: Record<string, unknown>;
  evidenceTimeline: Array<Record<string, unknown>>;
  graphRelations: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
};

export type ResearchAgentStage = {
  id: string;
  name: string;
  mission: string;
  summary: string;
  findings: string[];
  confidence: "高" | "中" | "低";
  evidenceGaps: string[];
  citationIds?: string[];
};

export type ResearchAnalysisSection = {
  id: string;
  title: string;
  summary: string;
  findings: string[];
  citationIds: string[];
};

export type ResearchDecisionDashboard = {
  signal: string;
  timeSensitivity: string;
  noPosition: string;
  hasPosition: string;
  watchConditions: string[];
  citationIds: string[];
};

export type ResearchDepth = "quick" | "standard" | "deep";

export type ResearchExecution = {
  mode: ResearchDepth;
  agentCalls: number;
  maxAgentCalls: number;
  totalTokens: number;
  maxOutputTokens: number;
  elapsedMs: number;
  timeoutMs: number;
  skills?: string[];
  toolTrace?: Array<{ tool: string; status: "completed" | "unavailable"; detail: string }>;
};

export type DeepResearchResult = {
  /** User-facing free-form answer. Structured fields below are supporting metadata, not a UI template. */
  answerMarkdown?: string;
  thesis: string;
  investmentValue: string;
  confidence: "高" | "中" | "低";
  stages: ResearchAgentStage[];
  catalysts: string[];
  risks: string[];
  verificationQuestions: string[];
  evidenceBoundary: string;
  plan?: ResearchPlan;
  answerBlocks?: ResearchAnswerBlock[];
  analysisSections?: ResearchAnalysisSection[];
  decisionDashboard?: ResearchDecisionDashboard;
  model: string;
  citations?: ResearchCitation[];
  unsupportedClaimCount?: number;
  execution?: ResearchExecution;
  degradedReason?: string;
};

export type ResearchReportResult = {
  title: string;
  executiveSummary: string;
  markdown: string;
  model: string;
  citations: ResearchCitation[];
  quality: ResearchReportQuality;
  charts: ResearchReportChart[];
};

type AgentFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
type ResearchAgentBlueprint = Pick<ResearchAgentStage, "id" | "name" | "mission"> & {
  kind?: ResearchPlanTask["kind"] | "chief" | "planner";
  skillId?: string;
  evidenceKeywords?: string[];
  expectedOutput?: string;
};

const CHIEF_BLUEPRINT: ResearchAgentBlueprint = {
  id: "chief",
  name: "主审 Agent",
  mission: "交叉验证动态研究任务、识别分歧和证据缺口，并按本轮研究计划形成答案。",
  kind: "chief",
};
const MODE_LIMITS: Record<ResearchDepth, { maxAgentCalls: number; specialistTokens: number; chiefTokens: number; timeoutMs: number }> = {
  // The provider profile allows substantially larger structured replies.
  // The earlier limits truncated Chinese JSON mid-string, causing the visible
  // "Unterminated string" failure even though the model request itself succeeded.
  quick: { maxAgentCalls: 1, specialistTokens: 0, chiefTokens: 5200, timeoutMs: 80_000 },
  standard: { maxAgentCalls: 7, specialistTokens: 2800, chiefTokens: 7600, timeoutMs: 135_000 },
  deep: { maxAgentCalls: 9, specialistTokens: 4200, chiefTokens: 11_000, timeoutMs: 220_000 },
};

export async function runDeepResearchTeam(
  facts: CompanyResearchFacts,
  input: {
    question: string;
    depth: ResearchDepth;
    skills?: string[];
    conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
    onProgress?: (event: ResearchProgressEvent) => void;
  },
  config: DeepSeekConfig = {},
  fetcher: AgentFetcher = fetch,
): Promise<DeepResearchResult> {
  const model = config.model ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
  const startedAt = Date.now();
  const limits = MODE_LIMITS[input.depth];
  const selectedSkills = resolveResearchSkills(input.skills);
  const citations = buildResearchEvidenceCatalog(facts);
  const researchContext = buildBoundedResearchContext(facts);
  const question = input.question || "当前研究对象的真实产业位置、核心价值、催化与主要风险是什么？";
  const sourcePolicy = inferResearchSourceScenario(question);
  const toolTrace = buildToolTrace(facts);
  const emitProgress = (event: Omit<ResearchProgressEvent, "createdAt">) => {
    input.onProgress?.(createResearchProgressEvent(event));
  };

  const planInput = { question, depth: input.depth, skills: selectedSkills, facts };
  let plan = buildFallbackResearchPlan(planInput);
  let plannerTokens = 0;
  let plannerCalls = 0;

  if (input.depth !== "quick") {
    const plannerStartedAt = Date.now();
    emitProgress({
      type: "agent_start",
      step: 3,
      message: "规划 Agent 正在拆分研究问题、方法任务和反证路径",
      stageId: "planner",
      displayName: "规划 Agent",
    });
    try {
      const planningEvidence = citations.slice(0, 32).map((citation) => ({
        id: citation.id,
        title: citation.title,
        sourceType: citation.sourceType,
        sourceDate: citation.sourceDate,
      }));
      const planningCall = await callDeepSeekJson(
        researchMessages({
          task: "研究规划",
          question,
          depth: input.depth,
          target: facts.subject,
          selectedSkills: selectedSkills.map(skillForPrompt),
          availableEvidence: planningEvidence,
          sourcePolicy,
          conversationHistory: compactConversationHistory(input.conversationHistory, 4, 500),
          outputSchema: researchPlanOutputSchema(),
          outputRules: {
            taskLimit: input.depth === "deep" ? 7 : 5,
            requirement: "任务和结果布局必须由本次问题决定；用户显式选择的方法必须各有独立 method 任务；至少包含一个反证或核验任务。不要套用固定公司/行业/风险章节。",
          },
        }),
        { ...config, model },
        2_200,
        Math.min(limits.timeoutMs, 55_000),
        fetcher,
      );
      plannerCalls = 1;
      plannerTokens = planningCall.totalTokens;
      plan = normalizeResearchPlan(planningCall.data, planInput);
      emitProgress({
        type: "agent_done",
        step: 3,
        message: `已生成 ${plan.tasks.length} 项动态研究任务与 ${plan.answerLayout.length} 个结果块`,
        stageId: "planner",
        displayName: "规划 Agent",
        success: true,
        durationMs: Date.now() - plannerStartedAt,
      });
    } catch (error) {
      if (!(error instanceof ResearchModelOutputError)) throw error;
      plannerCalls = 1;
      emitProgress({
        type: "agent_done",
        step: 3,
        message: "规划输出不可用，已切换到问题感知的保守研究计划",
        stageId: "planner",
        displayName: "规划 Agent",
        success: false,
        durationMs: Date.now() - plannerStartedAt,
      });
    }
  } else {
    emitProgress({
      type: "thinking",
      step: 3,
      message: `已按问题生成 ${plan.answerLayout.length} 个动态回答块`,
    });
  }

  const activeBlueprints = plan.tasks.map(planTaskBlueprint);

  if (input.depth === "quick") {
    const quickStartedAt = Date.now();
    const quickEvidence = aliasEvidenceCatalog(selectEvidenceForRole(
      citations,
      "quick",
      24,
      700,
      [...plan.tasks.flatMap((task) => task.evidenceKeywords), ...questionEvidenceKeywords(question)],
    ));
    emitProgress({
      type: "agent_start",
      step: 4,
      message: "协调 Agent 正在综合证据与策略",
      stageId: "chief",
      displayName: "协调 Agent",
    });
    const call = await callDeepSeekJson(
      researchMessages({
        task: "快速联合研判",
        question,
        plan,
        roles: [...activeBlueprints, CHIEF_BLUEPRINT],
        selectedSkills: selectedSkills.map(skillForPrompt),
        conversationHistory: compactConversationHistory(input.conversationHistory, 4, 600),
        researchContext: buildQuickResearchContext(facts),
        evidenceCatalog: quickEvidence.catalog,
        sourcePolicy,
          outputSchema: chiefOutputSchema(true, [...activeBlueprints, CHIEF_BLUEPRINT], quickEvidence.exampleId),
        outputRules: {
          targetChineseChars: "按问题复杂度决定：概念或单点问题300-900字，常规分析900-1800字，多方法问题1500-3000字",
          stageFindingLimit: 3,
          catalystLimit: 3,
          riskLimit: 4,
          verificationQuestionLimit: 4,
          requirement: `answerMarkdown 必须直接回答用户原始问题并自由组织表达；篇幅与问题复杂度匹配，不展示内部计划，不套固定报告章节。其余 JSON 字段只用于证据审计和系统元数据。${questionEvidenceRequirement(question)}`,
        },
      }),
      { ...config, model },
      limits.chiefTokens,
      limits.timeoutMs,
      fetcher,
    );
    emitProgress({
      type: "agent_done",
      step: 5,
      message: "协调 Agent 已完成联合研判",
      stageId: "chief",
      displayName: "协调 Agent",
      success: true,
      durationMs: Date.now() - quickStartedAt,
    });
    emitProgress({
      type: "generating",
      step: 6,
      message: "正在校验引用并生成最终结论",
    });
    return applyResearchResultGuardrails(normalizeResearchResult(remapCitationAliases(call.data, quickEvidence.aliasToCanonical), model, citations, {
      mode: input.depth,
      agentCalls: 1,
      maxAgentCalls: limits.maxAgentCalls,
      totalTokens: call.totalTokens,
      maxOutputTokens: limits.chiefTokens,
      elapsedMs: Date.now() - startedAt,
      timeoutMs: limits.timeoutMs,
      skills: selectedSkills.map((skill) => skill.id),
      toolTrace,
    }, undefined, 0, [...activeBlueprints, CHIEF_BLUEPRINT], plan), facts);
  }

  const allowedIds = new Set(citations.map((citation) => citation.id));
  emitProgress({
    type: "thinking",
    step: 3,
    message: `正在调度 ${activeBlueprints.length} 个专家角色并行研判`,
  });
  const specialistCalls = await Promise.all(activeBlueprints.map(async (blueprint) => {
    const specialistStartedAt = Date.now();
    emitProgress({
      type: "agent_start",
      step: 4,
      message: `${blueprint.name}开始分析`,
      stageId: blueprint.id,
      displayName: blueprint.name,
    });
    try {
      const specialistEvidence = aliasEvidenceCatalog(selectEvidenceForRole(citations, blueprint.id, 24, 600, blueprint.evidenceKeywords));
      const call = await callDeepSeekJson(
        researchMessages({
          task: "独立专家研判",
          question,
          planObjective: plan.objective,
          role: blueprint,
          skill: blueprint.skillId ? selectedSkills.find((skill) => skill.id === blueprint.skillId) : undefined,
          conversationHistory: compactConversationHistory(input.conversationHistory),
          researchContext,
          evidenceCatalog: specialistEvidence.catalog,
          sourcePolicy,
          outputSchema: specialistOutputSchema(blueprint.id, specialistEvidence.exampleId),
          outputRules: {
            requirement: "只完成 role.mission，不复述通用模板；明确支持证据、反对证据、证据缺口和结论失效条件。",
          },
        }),
        { ...config, model },
        limits.specialistTokens,
        limits.timeoutMs,
        fetcher,
      );
      const remappedData = remapCitationAliases(call.data, specialistEvidence.aliasToCanonical);
      emitProgress({
        type: "agent_done",
        step: 4,
        message: `${blueprint.name}已完成分析`,
        stageId: blueprint.id,
        displayName: blueprint.name,
        success: true,
        durationMs: Date.now() - specialistStartedAt,
      });
      return {
        call: { ...call, data: remappedData },
        stage: normalizeAgentStage(remappedData, blueprint, citations),
        unsupportedClaimCount: countUnsupportedStageClaims(remappedData, allowedIds),
      };
    } catch (error) {
      if (!(error instanceof ResearchModelOutputError)) throw error;
      const detail = specialistFailureMessage(error);
      emitProgress({
        type: "agent_done",
        step: 4,
        message: `${blueprint.name}输出不可用，已降级并继续研究`,
        stageId: blueprint.id,
        displayName: blueprint.name,
        success: false,
        durationMs: Date.now() - specialistStartedAt,
      });
      return {
        call: { data: {}, totalTokens: 0 },
        stage: {
          ...blueprint,
          summary: "该角色本轮输出不可用，系统已隔离异常结果并继续执行其余研究流程。",
          findings: [],
          confidence: "低" as const,
          evidenceGaps: [detail],
          citationIds: [],
        },
        unsupportedClaimCount: 0,
      };
    }
  }));

  const chiefStartedAt = Date.now();
  emitProgress({
    type: "agent_start",
    step: 5,
    message: "主审 Agent 正在交叉验证专家结论",
    stageId: "chief",
    displayName: "主审 Agent",
  });
  let chiefCall;
  let chiefSucceeded = true;
  try {
    const chiefEvidence = aliasEvidenceCatalog(selectChiefEvidence(citations, specialistCalls.map((row) => row.stage)));
    chiefCall = await callDeepSeekJson(
      researchMessages({
        task: "主审交叉验证",
        question,
        plan,
        role: CHIEF_BLUEPRINT,
        selectedSkills: selectedSkills.map(skillForPrompt),
        researchContext,
        specialistResults: specialistCalls.map((row) => aliasStageCitations(row.stage, chiefEvidence.canonicalToAlias)),
        evidenceCatalog: chiefEvidence.catalog,
        sourcePolicy,
        outputSchema: chiefOutputSchema(false, [...activeBlueprints, CHIEF_BLUEPRINT], chiefEvidence.exampleId),
        outputRules: {
          targetChineseChars: input.depth === "deep" ? "按证据复杂度2500-6000字" : "按问题复杂度1000-3500字",
          requirement: "answerMarkdown 必须综合专家结果后直接回答用户原始问题，结构与篇幅完全由问题决定；显式选择的方法要自然融入正文，不展示内部 Agent 或 plan，不机械生成固定章节。只有用户问题涉及仓位、交易或决策时才返回 decisionDashboard，否则返回 null。其余字段仅作审计元数据。",
        },
      }),
      { ...config, model },
      limits.chiefTokens,
      limits.timeoutMs,
      fetcher,
    );
    chiefCall = { ...chiefCall, data: remapCitationAliases(chiefCall.data, chiefEvidence.aliasToCanonical) };
  } catch (error) {
    if (!(error instanceof ResearchModelOutputError)) throw error;
    chiefSucceeded = false;
    chiefCall = {
      data: fallbackChiefResult(specialistCalls.map((row) => row.stage)),
      totalTokens: 0,
    };
  }
  emitProgress({
    type: "agent_done",
    step: 5,
    message: chiefSucceeded
      ? "主审 Agent 已完成交叉验证"
      : "主审 Agent 输出不可用，已生成保守的证据汇总",
    stageId: "chief",
    displayName: "主审 Agent",
    success: chiefSucceeded,
    durationMs: Date.now() - chiefStartedAt,
  });
  emitProgress({
    type: "generating",
    step: 6,
    message: "正在校验引用并生成最终结论",
  });
  const specialistStages = specialistCalls.map((row) => row.stage);
  const chiefStage = normalizeAgentStage(
    isRecord(chiefCall.data.chief) ? chiefCall.data.chief : chiefCall.data,
    CHIEF_BLUEPRINT,
    citations,
  );
  const totalTokens = plannerTokens + specialistCalls.reduce((sum, row) => sum + row.call.totalTokens, chiefCall.totalTokens);
  const maxAgentCalls = activeBlueprints.length + 2;
  return applyResearchResultGuardrails(normalizeResearchResult(chiefCall.data, model, citations, {
    mode: input.depth,
    agentCalls: plannerCalls + specialistCalls.length + 1,
    maxAgentCalls,
    totalTokens,
    maxOutputTokens: 2_200 + limits.specialistTokens * activeBlueprints.length + limits.chiefTokens,
      elapsedMs: Date.now() - startedAt,
      timeoutMs: limits.timeoutMs,
      skills: selectedSkills.map((skill) => skill.id),
      toolTrace,
    }, [...specialistStages, chiefStage], specialistCalls.reduce((sum, row) => sum + row.unsupportedClaimCount, 0), [...activeBlueprints, CHIEF_BLUEPRINT], plan), facts);
}

export function buildEvidenceFallbackResearchResult(
  facts: CompanyResearchFacts,
  input: {
    depth: ResearchDepth;
    skills?: string[];
    question?: string;
    reason: string;
  },
): DeepResearchResult {
  const startedAt = Date.now();
  const selectedSkills = resolveResearchSkills(input.skills);
  const plan = buildFallbackResearchPlan({
    question: input.question || "梳理当前可验证事实与证据缺口",
    depth: input.depth,
    skills: selectedSkills,
    facts,
  });
  const blueprints = [...plan.tasks.map(planTaskBlueprint), CHIEF_BLUEPRINT];
  const catalog = buildResearchEvidenceCatalog(facts).slice(0, 32);
  const referencedIds = new Set<string>();
  const stages = blueprints.map((blueprint) => {
    const evidence = selectEvidenceForRole(catalog, blueprint.id, 3, 600, blueprint.evidenceKeywords);
    evidence.forEach((citation) => referencedIds.add(citation.id));
    return {
      ...blueprint,
      summary: evidence.length
        ? `模型服务暂不可用；本角色仅整理了 ${evidence.length} 条可追溯资料，不生成推断性结论。`
        : "模型服务暂不可用，且当前没有可供本角色引用的资料。",
      findings: evidence.map(formatFallbackEvidenceFinding),
      confidence: "低" as const,
      evidenceGaps: evidence.length
        ? ["待模型服务恢复后完成交叉验证与结论生成"]
        : ["待补充可追溯资料并重新执行研究"],
      citationIds: evidence.map((citation) => citation.id),
    };
  });
  const citations = catalog.filter((citation) => referencedIds.has(citation.id));
  const subject = facts.subject?.label || facts.subject?.key || "当前研究对象";
  const marketFallback = facts.company.subjectType === "market";
  const analysisSections = stages
    .filter((stage) => stage.id !== "chief")
    .map((stage) => ({
      id: stage.id,
      title: stage.name.replace(/\s*Agent$/i, "分析"),
      summary: stage.summary,
      findings: stage.findings,
      citationIds: stage.citationIds,
    }))
    .filter((section) => section.findings.length > 0);
  const answerBlocks: ResearchAnswerBlock[] = analysisSections.map((section) => ({
    ...section,
    kind: section.id.startsWith("skill:") ? "method" : section.id.includes("risk") || section.id.includes("counter") ? "risk" : "evidence",
  }));
  return {
    answerMarkdown: buildEvidenceFallbackAnswer({
      question: input.question || `分析${subject}`,
      subject,
      citations,
      reason: input.reason,
      marketFallback,
    }),
    thesis: citations.length
      ? `${subject}已载入 ${citations.length} 条可追溯资料；由于模型服务暂不可用，本次展示${marketFallback ? "指数、板块轮动与市场情报" : "证据"}摘要，不形成投资结论。`
      : `${subject}当前没有足够的可引用资料，且模型服务暂不可用，本次不形成研究结论。`,
    investmentValue: citations.length
      ? "现有资料可用于继续核验；待模型服务恢复后再完成多角色交叉研判。"
      : "应先补充公司、财务、公告或研报资料，再评估后续调研价值。",
    confidence: "低",
    stages,
    plan,
    answerBlocks,
    analysisSections,
    catalysts: ["催化因素待模型恢复后结合现有证据重新研判"],
    risks: ["当前结果为数据源证据降级摘要，不能替代完整研究结论"],
    verificationQuestions: [
      marketFallback ? "主要指数的量价趋势能否在下一交易窗口延续？" : "哪些公告或财务数据可以直接验证主营增长质量？",
      marketFallback ? "领涨和领跌板块是否出现持续轮动或市场广度改善？" : "当前行情与估值数据的采集时间是否满足本次决策时效？",
      "模型服务恢复后，是否需要重新执行主审交叉验证？",
    ],
    evidenceBoundary: "仅展示统一 Provider 已取得且带来源链接的资料；未调用模型补全任何事实或判断。",
    model: "evidence-fallback",
    citations,
    unsupportedClaimCount: 0,
    degradedReason: input.reason,
    execution: {
      mode: input.depth,
      agentCalls: 0,
      maxAgentCalls: MODE_LIMITS[input.depth].maxAgentCalls,
      totalTokens: 0,
      maxOutputTokens: 0,
      elapsedMs: Date.now() - startedAt,
      timeoutMs: MODE_LIMITS[input.depth].timeoutMs,
      skills: selectedSkills.map((skill) => skill.id),
      toolTrace: buildToolTrace(facts),
    },
  };
}

function formatFallbackEvidenceFinding(citation: ResearchCitation) {
  const excerpt = citation.excerpt.trim();
  if (citation.title.includes("行业") || citation.title.includes("板块")) {
    const leaders = [...excerpt.matchAll(/"name":"([^"]+)"[^}]*?"changePercent":(-?\d+(?:\.\d+)?)[^}]*?"upCount":(\d+)[^}]*?"downCount":(\d+)/g)]
      .slice(0, 5)
      .map((match) => `${match[1]} ${Number(match[2]) >= 0 ? "+" : ""}${match[2]}%（上涨 ${match[3]} / 下跌 ${match[4]}）`);
    if (leaders.length) return `${citation.title}：当前可核验样本为 ${leaders.join("；")}。`;
  }
  const jsonStart = [excerpt.indexOf("["), excerpt.indexOf("{")].filter((index) => index >= 0).sort((left, right) => left - right)[0];
  if (jsonStart !== undefined) {
    try {
      const parsed: unknown = JSON.parse(excerpt.slice(jsonStart));
      if (Array.isArray(parsed)) {
        const rows = parsed.filter(isRecord).slice(0, 5).map((row) => {
          const name = typeof row.name === "string" ? row.name : typeof row.code === "string" ? row.code : "指数";
          const price = typeof row.price === "number" ? `${row.price} 点` : "";
          const change = typeof row.changePercent === "number" ? `${row.changePercent >= 0 ? "+" : ""}${row.changePercent}%` : "";
          return `${name}${price ? ` ${price}` : ""}${change ? `（${change}）` : ""}`;
        }).filter(Boolean);
        if (rows.length) return `${citation.title}：${rows.join("；")}。`;
      }
      if (isRecord(parsed) && Array.isArray(parsed.top)) {
        const leaders = parsed.top.filter(isRecord).slice(0, 5).map((row) => {
          const name = typeof row.name === "string" ? row.name : "行业";
          const change = typeof row.changePercent === "number" ? `${row.changePercent >= 0 ? "+" : ""}${row.changePercent}%` : "待核验";
          const breadth = typeof row.upCount === "number" && typeof row.downCount === "number" ? `，上涨 ${row.upCount} / 下跌 ${row.downCount}` : "";
          return `${name} ${change}${breadth}`;
        });
        if (leaders.length) return `${citation.title}：当前可核验样本为 ${leaders.join("；")}。`;
      }
    } catch {
      // Preserve a readable excerpt when an upstream provider returns partial JSON.
    }
  }
  const readable = excerpt
    .replace(/[\[\]{}"\\]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*[:,]\s*/g, "、")
    .trim();
  return `${citation.title}：${readable.slice(0, 180)}${readable.length > 180 ? "…" : ""}`;
}

export async function generateResearchReport(
  facts: CompanyResearchFacts,
  analysis: DeepResearchResult | null,
  input: {
    reportType: ResearchReportType;
    focus: string;
    onProgress?: (event: ReportGenerationProgress) => void;
  },
  config: DeepSeekConfig = {},
  fetcher: AgentFetcher = fetch,
): Promise<ResearchReportResult> {
  const model = config.model ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
  const catalog = buildResearchEvidenceCatalog(facts);
  const outline = reportOutline(input.reportType);
  const emitProgress = (event: Parameters<typeof createReportProgress>[0]) => {
    input.onProgress?.(createReportProgress(event));
  };
  emitProgress({
    phase: "outline",
    step: 2,
    message: "报告结构已编排",
    detail: `已建立 ${outline.length} 个必需章节，并锁定事实与判断分离规则`,
    reportType: input.reportType,
    completedSections: 0,
    totalSections: outline.length,
  });
  emitProgress({
    phase: "evidence",
    step: 3,
    message: "证据目录已装载",
    detail: `已载入 ${catalog.length} 条可追溯资料；正文只接受目录内引用`,
    reportType: input.reportType,
    citationCount: catalog.length,
    completedSections: 0,
    totalSections: outline.length,
  });
  emitProgress({
    phase: "analysis",
    step: 4,
    message: analysis ? "联合研判结果已接入" : "使用统一研究档案生成",
    detail: analysis
      ? `已接入 ${analysis.stages.length} 个研究角色的结论与反证`
      : "当前没有可复用的 AI 研判结果，将仅依据本地事实与证据目录写作",
    reportType: input.reportType,
    citationCount: catalog.length,
    completedSections: 0,
    totalSections: outline.length,
  });
  emitProgress({
    phase: "drafting",
    step: 5,
    message: "正在生成完整研报正文",
    detail: "模型正在按统一大纲组织章节、段落引用与待验证边界",
    reportType: input.reportType,
    sectionTitle: outline[0],
    citationCount: catalog.length,
    completedSections: 0,
    totalSections: outline.length,
  });
  const call = await callDeepSeekJson(
    [
      {
        role: "system",
        content:
          "你是严谨的A股研究报告撰写助手。只能使用 facts、teamAnalysis 与 evidenceCatalog。每个事实性段落必须返回 evidenceCatalog 中存在的 citationIds；没有证据时写“待补”或“待验证”，不得使用模型记忆补全。事实和判断分开，禁止虚构数字、客户、订单、估值与市场份额。输出严格JSON，不构成投资建议。",
      },
      {
        role: "user",
        content: JSON.stringify({
          reportType: input.reportType,
          focus: input.focus,
          facts,
          teamAnalysis: analysis,
          evidenceCatalog: catalog,
          requiredOutline: outline,
          outputSchema: {
            title: "报告标题",
            executiveSummary: "120字以内摘要；有事实内容时需在对应章节提供引用",
            sections: outline.map((title) => ({
              title,
              claims: [{ text: "一段事实、判断或明确的待补说明", citationIds: ["evidence:1"] }],
            })),
          },
        }),
      },
    ],
    { ...config, model },
    5200,
    58_000,
    fetcher,
  );
  emitProgress({
    phase: "quality",
    step: 6,
    message: "正在执行引用与质量校验",
    detail: "逐段拦截无有效引用的事实陈述，并核验章节、风险与证据覆盖",
    reportType: input.reportType,
    citationCount: catalog.length,
    completedSections: outline.length,
    totalSections: outline.length,
  });
  const result = normalizeResearchReport(call.data, facts, analysis, input.reportType, outline, catalog, model);
  emitProgress({
    phase: "rendering",
    step: 7,
    message: "报告正文与图表已完成",
    detail: `质量评分 ${result.quality.score}/100，保留 ${result.citations.length} 条有效引用与 ${result.charts.length} 个可追溯图表`,
    reportType: input.reportType,
    citationCount: result.citations.length,
    completedSections: outline.length,
    totalSections: outline.length,
  });
  return result;
}

export async function rewriteResearchReportSection(
  input: {
    markdown: string;
    sectionTitle: string;
    instruction: string;
    citations: ResearchCitation[];
  },
  config: DeepSeekConfig = {},
  fetcher: AgentFetcher = fetch,
) {
  const model = config.model ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
  const currentSection = extractMarkdownSection(input.markdown, input.sectionTitle);
  const call = await callDeepSeekJson(
    [
      {
        role: "system",
        content:
          "你是研究报告编辑。只能使用给定章节和 evidenceCatalog，不得增加目录外事实。每个事实性段落必须返回有效 citationIds；没有证据时明确写待补。输出严格JSON。",
      },
      {
        role: "user",
        content: JSON.stringify({
          sectionTitle: input.sectionTitle,
          currentSection,
          instruction: input.instruction,
          evidenceCatalog: input.citations,
          outputSchema: { claims: [{ text: "改写后的段落", citationIds: ["evidence:1"] }] },
        }),
      },
    ],
    { ...config, model },
    1800,
    24_000,
    fetcher,
  );
  const allowedIds = new Set(input.citations.map((citation) => citation.id));
  const normalized = normalizeReportClaims(call.data.claims, allowedIds);
  const replacement = normalized.claims.length
    ? normalized.claims.map((claim) => `${claim.text}${formatClaimCitations(claim.citationIds)}`).join("\n\n")
    : "待补：当前证据目录不足以支持本节改写。";
  return {
    markdown: replaceMarkdownSection(input.markdown, input.sectionTitle, replacement),
    unsupportedClaimCount: normalized.unsupportedClaimCount,
    model,
  };
}

function normalizeResearchReport(
  value: Record<string, unknown>,
  facts: CompanyResearchFacts,
  analysis: DeepResearchResult | null,
  reportType: ResearchReportType,
  outline: string[],
  catalog: ResearchCitation[],
  model: string,
): ResearchReportResult {
  const title = textValue(value.title, `${facts.subject?.label || "研究标的"}研究报告`);
  let executiveSummary = textValue(value.executiveSummary, "当前证据不足，研究摘要待补。");
  const allowedIds = new Set(catalog.map((citation) => citation.id));
  const rawSections = Array.isArray(value.sections) ? value.sections.filter(isRecord) : [];
  let unsupportedClaimCount = 0;
  const usedIds = new Set<string>();
  const acceptedTexts: string[] = [];
  // Never accept a free-form markdown fallback from the model. Only structured
  // claims pass through citation validation; otherwise an ungrounded paragraph
  // could bypass the evidence boundary entirely.
  const sectionBodies = outline.map((sectionTitle, index) => {
    const rawSection = rawSections.find((section) => textValue(section.title, "") === sectionTitle) ?? rawSections[index] ?? {};
    const normalized = normalizeReportClaims(rawSection.claims, allowedIds);
    unsupportedClaimCount += normalized.unsupportedClaimCount;
    normalized.claims.forEach((claim) => claim.citationIds.forEach((id) => usedIds.add(id)));
    acceptedTexts.push(...normalized.claims.filter((claim) => claim.citationIds.length > 0).map((claim) => claim.text));
    const body = normalized.claims.length
      ? normalized.claims.map((claim) => `${claim.text}${formatClaimCitations(claim.citationIds)}`).join("\n\n")
      : "待补：当前证据目录不足以支持本节结论。";
    return `## ${sectionTitle}\n\n${body}`;
  });
  executiveSummary = acceptedTexts.length
    ? acceptedTexts.slice(0, 2).join(" ").slice(0, 180)
    : "当前没有足够的可引用证据形成报告摘要。";
  const referencedCitations = catalog.filter((citation) => usedIds.has(citation.id));
  const appendix = referencedCitations.length
    ? referencedCitations.map((citation) =>
      `- [${citation.id}] ${citation.title}${citation.sourceDate ? `（${citation.sourceDate}）` : ""}${citation.url ? ` ${citation.url}` : ""}`,
    ).join("\n")
    : "- 待补：尚无通过引用校验的资料。";
  const markdown = [
    `# ${title}`,
    `> ${executiveSummary}${formatClaimCitations([...usedIds].slice(0, 3))}`,
    ...sectionBodies,
    "## 引用资料",
    appendix,
    "## 免责声明",
    "本报告仅供研究参考，不构成任何投资建议。",
  ].join("\n\n");

  const citations = catalog.filter((citation) => usedIds.has(citation.id));
  const quality = evaluateResearchReport(markdown, citations, reportType, unsupportedClaimCount, outline);
  const analysisUnsupported = analysis?.unsupportedClaimCount ?? 0;
  if (analysisUnsupported > 0) {
    quality.issues.push(`上游联合研判曾拦截 ${analysisUnsupported} 条无依据陈述，报告未采纳这些内容`);
  }
  return {
    title,
    executiveSummary,
    markdown,
    model,
    citations,
    quality,
    charts: buildResearchReportCharts(facts, catalog),
  };
}

export function evaluateResearchReport(
  markdown: string,
  citations: ResearchCitation[],
  reportType: ResearchReportType,
  unsupportedClaimCount = 0,
  requiredOutline = reportOutline(reportType),
): ResearchReportQuality {
  const sectionCount = requiredOutline.filter((title) => markdown.includes(`## ${title}`)).length;
  const sectionCoverage = Math.round(sectionCount / Math.max(1, requiredOutline.length) * 100);
  const contentParagraphs = markdown.split(/\n{2,}/).filter((paragraph) =>
    paragraph.trim()
    && !paragraph.startsWith("#")
    && !paragraph.startsWith("- [")
    && !/^本报告仅供研究参考/.test(paragraph)
    && !/待补|待验证|资料不足|尚无/.test(paragraph),
  );
  const citedParagraphs = contentParagraphs.filter((paragraph) => /\[[\w\u4e00-\u9fa5:-]+\]/.test(paragraph)).length;
  const citationCoverage = contentParagraphs.length
    ? Math.round(citedParagraphs / contentParagraphs.length * 100)
    : 0;
  const evidenceQuality = citations.length
    ? Math.round(citations.reduce((sum, citation) =>
      sum + (citation.credibility === "高" ? 100 : citation.credibility === "中" ? 72 : 38), 0) / citations.length)
    : 0;
  const riskSection = /## .*(风险|反证)/.test(markdown);
  const riskDisclosure = riskSection && !/## .*(风险|反证)[\s\S]{0,120}待补/.test(markdown) ? 100 : riskSection ? 55 : 0;
  const penalty = Math.min(25, unsupportedClaimCount * 4);
  const score = Math.max(0, Math.min(100, Math.round(
    sectionCoverage * .35 + citationCoverage * .3 + evidenceQuality * .2 + riskDisclosure * .15 - penalty,
  )));
  const issues: string[] = [];
  if (sectionCoverage < 100) issues.push(`缺少 ${requiredOutline.length - sectionCount} 个必需章节`);
  if (citations.length === 0) issues.push("报告没有通过校验的引用资料");
  if (citationCoverage < 80) issues.push(`事实段落引用覆盖率仅 ${citationCoverage}%`);
  if (riskDisclosure < 100) issues.push("风险与反证披露仍需补充证据");
  if (unsupportedClaimCount > 0) issues.push(`已拦截 ${unsupportedClaimCount} 条无有效引用的陈述`);
  return {
    score,
    sectionCoverage,
    citationCoverage,
    evidenceQuality,
    riskDisclosure,
    unsupportedClaimCount,
    issues,
  };
}

function normalizeReportClaims(value: unknown, allowedIds: Set<string>) {
  if (!Array.isArray(value)) return { claims: [] as Array<{ text: string; citationIds: string[] }>, unsupportedClaimCount: 0 };
  const claims: Array<{ text: string; citationIds: string[] }> = [];
  let unsupportedClaimCount = 0;
  for (const item of value) {
    if (!isRecord(item)) {
      unsupportedClaimCount += typeof item === "string" ? 1 : 0;
      continue;
    }
    const text = textValue(item.text, textValue(item.statement, ""));
    if (!text) continue;
    const citationIds = validCitationIds(item.citationIds, allowedIds);
    if (citationIds.length === 0 && !isEvidenceGapText(text)) {
      unsupportedClaimCount += 1;
      continue;
    }
    claims.push({ text, citationIds });
  }
  return { claims, unsupportedClaimCount };
}

function buildResearchReportCharts(facts: CompanyResearchFacts, catalog: ResearchCitation[]): ResearchReportChart[] {
  const charts: ResearchReportChart[] = [];
  for (const fact of facts.fieldFacts) {
    const fieldKey = textValue(fact.fieldKey, "");
    if (!fieldKey.endsWith("businessComposition") || !Array.isArray(fact.value)) continue;
    const rows = fact.value.filter(isRecord).map((row) => ({
      label: textValue(row.name, textValue(row.itemName, "未命名业务")),
      value: numericValue(row.revenueRatio),
      secondary: numericValue(row.grossMargin),
    })).filter((row) => row.value !== null).map((row) => ({
      label: row.label,
      value: row.value as number,
      ...(row.secondary === null ? {} : { secondary: row.secondary as number }),
    }));
    if (rows.length < 2) continue;
    const citation = catalog.find((item) => item.title.startsWith(`${fieldKey} ·`));
    charts.push({
      id: `chart-${charts.length + 1}`,
      title: `${facts.subject?.label || "公司"}主营收入构成`,
      kind: "bar",
      unit: "%",
      sourceCitationIds: citation ? [citation.id] : [],
      rows: rows.slice(0, 8),
    });
  }
  return charts;
}

function reportOutline(reportType: ResearchReportType) {
  return reportOutlineForType(reportType);
}

function extractMarkdownSection(markdown: string, sectionTitle: string) {
  const escaped = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markdown.match(new RegExp(`## ${escaped}\\n+([\\s\\S]*?)(?=\\n## |$)`))?.[1]?.trim() ?? "";
}

function replaceMarkdownSection(markdown: string, sectionTitle: string, replacement: string) {
  const escaped = sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(## ${escaped}\\n+)([\\s\\S]*?)(?=\\n## |$)`);
  return pattern.test(markdown)
    ? markdown.replace(pattern, `$1${replacement}\n`)
    : `${markdown.trim()}\n\n## ${sectionTitle}\n\n${replacement}\n`;
}

function formatClaimCitations(citationIds: string[]) {
  return citationIds.length ? ` ${citationIds.map((id) => `[${id}]`).join(" ")}` : "";
}

function isEvidenceGapText(value: string) {
  return /待补|待验证|资料不足|尚无|无法判断|缺少证据/.test(value);
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/[%千万元亿,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function callDeepSeekJson(
  messages: Array<{ role: string; content: string }>,
  config: DeepSeekConfig,
  maxTokens: number,
  timeoutMs: number,
  fetcher: AgentFetcher,
) {
  const apiKey = config.apiKey ?? process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DeepSeek API key 未配置");
  const baseUrl = (config.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = config.model ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
  let totalTokens = 0;
  let finishReason = "";
  let malformedContent = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const retryMessages = attempt === 0
      ? messages
      : malformedContent
        ? [
          {
            role: "system",
            content:
              "你是 JSON 修复器。修复用户提供的不完整或非法 JSON；保留已有研究含义和 citationIds，删除无法修复的尾部字段，不新增事实。只输出一个紧凑、完整、可解析的 JSON 对象，不要 Markdown。",
          },
          {
            role: "user",
            content: JSON.stringify(buildJsonRepairPayload(messages, malformedContent)),
          },
        ]
        : [
          ...messages,
          {
            role: "system",
            content:
              "上一轮没有返回内容。请只输出一个完整、紧凑的 JSON 对象；缩短文字和数组，禁止 Markdown 代码围栏。",
          },
        ];
    const attemptMaxTokens = attempt === 0
      ? maxTokens
      : Math.min(maxTokens, 2_400);
    const response = await fetcher(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: retryMessages,
        // DeepSeek V4 enables thinking by default and counts reasoning tokens
        // against max_tokens. These calls already receive provider-grounded
        // evidence and need compact JSON, so thinking mode can consume the
        // entire budget before message.content is emitted. Disable it for this
        // structured synthesis path; multi-agent depth and chief review remain
        // responsible for the research reasoning workflow.
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        temperature: attempt === 0 ? 0.15 : 0,
        max_tokens: attemptMaxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(attempt === 0 ? timeoutMs : Math.min(timeoutMs, 30_000)),
    });
    if (!response.ok) throw new Error(deepSeekHttpErrorMessage(response.status));
    const payload = (await response.json()) as DeepSeekResponse;
    const choice = payload.choices?.[0];
    const content = choice?.message?.content;
    finishReason = choice?.finish_reason ?? "";
    totalTokens += payload.usage?.total_tokens
      ?? (payload.usage?.prompt_tokens ?? 0) + (payload.usage?.completion_tokens ?? 0);
    if (!content) {
      if (attempt === 0) continue;
      throw new ResearchModelOutputError(finishReason);
    }
    try {
      return {
        data: parseDeepSeekJson(content),
        totalTokens,
      };
    } catch (error) {
      if (!(error instanceof SyntaxError) || attempt > 0) {
        throw new ResearchModelOutputError(finishReason);
      }
      malformedContent = content;
    }
  }
  throw new ResearchModelOutputError(finishReason);
}

function buildJsonRepairPayload(
  messages: Array<{ role: string; content: string }>,
  malformedContent: string,
) {
  let original: Record<string, unknown> = {};
  const userMessage = [...messages].reverse().find((message) => message.role === "user");
  try {
    const parsed = JSON.parse(userMessage?.content ?? "") as unknown;
    if (isRecord(parsed)) original = parsed;
  } catch {
    // The malformed model output is sufficient for a generic repair attempt.
  }
  return {
    task: original.task ?? "修复结构化输出",
    role: original.role,
    outputSchema: original.outputSchema,
    repairInstruction: "修复为完整 JSON，总中文字符不超过 2800；删除无法修复的尾部字段，不新增事实",
    malformedJson: malformedContent.slice(0, 18_000),
  };
}

function deepSeekHttpErrorMessage(status: number) {
  if (status === 400) return "DeepSeek 请求参数无效，请检查模型与接口地址配置";
  if (status === 401 || status === 403) return "DeepSeek Key 无效或无访问权限，请在服务端更新密钥";
  if (status === 402) return "DeepSeek 账户余额或可用额度不足，请充值或更换可用 Key";
  if (status === 408) return "DeepSeek 请求超时，请稍后重试";
  if (status === 429) return "DeepSeek 请求过于频繁或额度受限，请稍后重试";
  if (status >= 500) return "DeepSeek 服务暂时不可用，请稍后重试";
  return `DeepSeek 调用失败（HTTP ${status}）`;
}

function parseDeepSeekJson(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  const candidate = start >= 0 && end >= start
    ? withoutFence.slice(start, end + 1)
    : withoutFence;
  const parsed = JSON.parse(candidate) as unknown;
  if (!isRecord(parsed)) throw new SyntaxError("DeepSeek JSON 根节点不是对象");
  return parsed;
}

function specialistFailureMessage(error: unknown) {
  if (error instanceof ResearchModelOutputError) {
    return "模型结构化输出不完整，自动重试后仍不可用";
  }
  return "模型服务调用暂时不可用，需要稍后重新核验";
}

function fallbackChiefResult(stages: ResearchAgentStage[]): Record<string, unknown> {
  const citationIds = [...new Set(stages.flatMap((stage) => stage.citationIds ?? []))];
  const verificationQuestions = [...new Set(stages.flatMap((stage) => stage.evidenceGaps))]
    .filter(Boolean)
    .slice(0, 6);
  return {
    thesis: citationIds.length
      ? "部分专家结论具备可追溯证据，但主审结构化输出不可用，本次仅保留低置信度证据汇总。"
      : "当前没有足够的可引用证据形成研究结论。",
    investmentValue: "主审输出已降级处理，建议核验现有证据并稍后重新运行研究。",
    confidence: "低",
    citationIds,
    chief: {
      summary: "主审模型输出不可用，系统未采纳不完整内容。",
      findings: [],
      citationIds,
      confidence: "低",
      evidenceGaps: ["需要重新执行主审交叉验证"],
    },
    catalysts: [],
    risks: [],
    verificationQuestions: verificationQuestions.length
      ? verificationQuestions
      : ["重新执行主审交叉验证并确认关键结论"],
    evidenceBoundary: "仅汇总已通过引用校验的专家结果；不完整的模型输出已被丢弃。",
  };
}

function normalizeResearchResult(
  value: Record<string, unknown>,
  model: string,
  catalog: ResearchCitation[],
  execution: ResearchExecution,
  providedStages?: ResearchAgentStage[],
  unsupportedClaimOffset = 0,
  blueprints: ResearchAgentBlueprint[] = [CHIEF_BLUEPRINT],
  plan?: ResearchPlan,
): DeepResearchResult {
  const rawStages = Array.isArray(value.stages) ? value.stages.filter(isRecord) : [];
  const stages = providedStages ?? blueprints.map((blueprint) =>
    normalizeAgentStage(rawStages.find((stage) => stage.id === blueprint.id) ?? {}, blueprint, catalog),
  );
  const allowedIds = new Set(catalog.map((citation) => citation.id));
  const answerMarkdown = normalizeAnswerMarkdown(value.answerMarkdown, allowedIds);
  const chiefIds = validCitationIds(value.citationIds, allowedIds);
  const catalystClaims = groundedClaims(value.catalysts, allowedIds);
  const riskClaims = groundedClaims(value.risks, allowedIds);
  const answerBlocks = normalizeAnswerBlocks(value.answerBlocks ?? value.analysisSections, catalog, stages, catalystClaims, riskClaims, plan);
  const analysisSections: ResearchAnalysisSection[] = answerBlocks.map((section) => ({
    id: section.id,
    title: section.title,
    summary: section.summary,
    findings: section.findings,
    citationIds: section.citationIds,
  }));
  const decisionDashboard = normalizeDecisionDashboard(value.decisionDashboard, allowedIds);
  const referencedIds = new Set([
    ...extractMarkdownCitationIds(answerMarkdown, allowedIds),
    ...chiefIds,
    ...stages.flatMap((stage) => stage.citationIds),
    ...catalystClaims.citationIds,
    ...riskClaims.citationIds,
    ...answerBlocks.flatMap((section) => section.citationIds),
    ...(decisionDashboard?.citationIds ?? []),
  ]);
  const hasGrounding = chiefIds.length > 0 || answerBlocks.some((block) => block.citationIds.length > 0);
  const groundedAnswerMarkdown = hasGrounding
    ? answerMarkdown || buildNaturalAnswerMarkdown({
      thesis: textValue(value.thesis, "当前资料不足，建议先完成证据核验。"),
      investmentValue: textValue(value.investmentValue, "具备进一步调研价值，结论仍待证据验证。"),
      answerBlocks,
    })
    : "当前没有足够的可追溯资料形成有效研判。本轮不采用模型基于记忆生成的公司、行情或风险描述；请在数据源恢复或补充公司公告、财务与行情证据后重新提问。";
  return {
    answerMarkdown: sanitizeModelText(groundedAnswerMarkdown),
    thesis: sanitizeModelText(hasGrounding ? textValue(value.thesis, "当前资料不足，建议先完成证据核验。") : "当前没有足够的可引用证据形成研究结论。"),
    investmentValue: sanitizeModelText(hasGrounding ? textValue(value.investmentValue, "具备进一步调研价值，结论仍待证据验证。") : "应先补充可追溯资料，再评估后续调研价值。"),
    confidence: hasGrounding ? confidenceValue(value.confidence) : "低",
    stages,
    catalysts: catalystClaims.values.length ? catalystClaims.values : ["催化因素待验证"],
    risks: riskClaims.values.length ? riskClaims.values : ["业务与行业风险待验证"],
    verificationQuestions: stringList(value.verificationQuestions, ["核心业务收入占比和毛利率是多少？"]),
    evidenceBoundary: textValue(value.evidenceBoundary, "仅基于当前本地资料整理，缺失信息未作推断。"),
    ...(plan ? { plan } : {}),
    answerBlocks,
    analysisSections,
    ...(decisionDashboard ? { decisionDashboard } : {}),
    model,
    citations: catalog.filter((citation) => referencedIds.has(citation.id)),
    unsupportedClaimCount: unsupportedClaimOffset
      + countUnsupportedClaims(value, rawStages, allowedIds)
      + countUnsupportedAnalysisSections(value.answerBlocks ?? value.analysisSections, allowedIds)
      + stages.filter((stage) => (stage.citationIds?.length ?? 0) === 0).length,
    execution,
  };
}

function sanitizeModelText(value: string) {
  return sanitizePublicReportText(value)
    .replace(/\uFFFD+/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function applyResearchResultGuardrails(result: DeepResearchResult, facts: CompanyResearchFacts): DeepResearchResult {
  if (facts.company.subjectType !== "market") return result;
  const indicesFact = facts.fieldFacts.find((fact) => fact.fieldKey === "marketIndices" && fact.status === "available");
  const indices = Array.isArray(indicesFact?.value) ? indicesFact.value.filter(isRecord) : [];
  const changes = indices.map((item) => numberValue(item.changePercent)).filter((value): value is number => value !== null);
  const direction = changes.length > 0 && changes.every((value) => value > 0)
    ? "主要指数全线上涨"
    : changes.length > 0 && changes.every((value) => value < 0)
      ? "主要指数全线下跌"
      : changes.length > 1 && changes.some((value) => value > 0) && changes.some((value) => value < 0)
        ? "主要指数涨跌分化"
        : "";
  const hs300Price = numberValue(indices.find((item) => String(item.code ?? "") === "000300")?.price);
  const technicalFact = facts.fieldFacts.find((fact) => fact.fieldKey === "marketTechnicalSnapshots" && fact.status === "available");
  const technicalSnapshots = isRecord(technicalFact?.value) && Array.isArray(technicalFact.value.snapshots)
    ? technicalFact.value.snapshots.filter(isRecord)
    : [];
  const shanghaiTechnical = technicalSnapshots.find((snapshot) => String(snapshot.stockCode ?? "") === "000001") ?? technicalSnapshots[0];
  const shanghaiMa = isRecord(shanghaiTechnical?.ma) ? shanghaiTechnical.ma : null;
  const technicalAvailable = technicalSnapshots.length > 0;
  const technicalCoverage = numberValue(shanghaiTechnical?.recordCount);
  const volumeRatio5 = numberValue(shanghaiTechnical?.volumeRatio5);
  const technicalCorrection = technicalAvailable && shanghaiMa
    ? `历史日线已覆盖${technicalCoverage ?? "足够"}个交易日；上证MA5/MA10/MA20/MA60分别为${numberValue(shanghaiMa.ma5)?.toFixed(2) ?? "待核"}、${numberValue(shanghaiMa.ma10)?.toFixed(2) ?? "待核"}、${numberValue(shanghaiMa.ma20)?.toFixed(2) ?? "待核"}、${numberValue(shanghaiMa.ma60)?.toFixed(2) ?? "待核"}点。`
    : "";
  const alignDirection = (text: string) => {
    const aligned = direction
      ? text.replace(/主要指数(?:呈现)?(?:涨跌互现|涨跌分化|分化上行|普遍上涨|全线上涨|全线下跌)/g, direction)
      : text;
    const correctedHs300 = hs300Price === null ? aligned : aligned.replace(
      /沪深300(?:指数)?(?:收于|报)?\s*(?:\d{2}xx|\d{3,4}(?:\.\d+)?)点(?:附近)?(?:（数据截断[^）]*）)?/gi,
      `沪深300指数报${hs300Price.toFixed(2)}点`,
    );
    const correctedTechnical = technicalAvailable
      ? correctedHs300
        .replace(/(?:由于|因)缺乏[^。！？]{0,50}(?:均线|K线)[^。！？]*[。！？]?/g, technicalCorrection)
        .replace(/(?:当前|现有)数据不足以?确认[^。！？]{0,60}[。！？]?/g, technicalCorrection)
        .replace(/放量下跌/g, volumeRatio5 !== null && volumeRatio5 >= 1.2 ? "放量下跌" : "下跌但近5日量比未显著放大")
      : correctedHs300;
    if (technicalAvailable) return correctedTechnical;
    return correctedTechnical
      .replace(
        /(\d{3,5}(?:\.\d+)?点)(?:附近)?(?:构成|形成|为)?(?:短期|技术)?支撑(?:位)?/g,
        "$1附近仅是盘中观察位置；历史K线缺失，尚不能确认技术支撑",
      )
      .replace(
        /考验(\d{3,5}(?:\.\d+)?点)(?:附近)?支撑(?:位)?/g,
        "观察是否下破$1；历史K线缺失，尚不能确认该位置为技术支撑",
      );
  };
  const sanitize = (text: string) => sanitizeMarketResearchText(alignDirection(text));
  const sectorAvailable = facts.fieldFacts.some((fact) => fact.fieldKey === "sectorRankings" && fact.status === "available");
  const answerBlocks = result.answerBlocks?.map((block) => {
    if (block.id !== "market-breadth" || sectorAvailable) return mapAnswerBlockText(block, sanitize);
    const indexCitationIds = block.citationIds.filter((id) => id.includes("marketIndices"));
    return {
      ...mapAnswerBlockText(block, sanitize),
      summary: "行业涨跌排名本轮未成功返回，暂不能据此判断实时市场广度、主线与板块轮动。",
      confidence: "低" as const,
      narrative: [{ text: "当前仅能确认主要指数表现；个股涨跌家数、行业排名和领涨持续性仍待实时数据补证。", citationIds: indexCitationIds }],
      findings: ["板块排名数据缺失，本轮不采纳社区观点替代实时市场广度。"],
      findingClaims: [{ text: "板块排名数据缺失，本轮不采纳社区观点替代实时市场广度。", citationIds: indexCitationIds }],
      keyMetrics: [],
      counterpoints: [],
      implications: [{ text: "在板块数据恢复前，只把指数方向作为有限线索，不外推市场主线。", citationIds: indexCitationIds }],
      citationIds: indexCitationIds,
    };
  });
  return {
    ...result,
    ...(result.answerMarkdown ? { answerMarkdown: sanitize(result.answerMarkdown) } : {}),
    thesis: sanitize(result.thesis),
    investmentValue: sanitize(result.investmentValue),
    stages: result.stages.map((stage) => ({
      ...stage,
      summary: sanitize(stage.summary),
      findings: stage.findings.map(sanitize),
    })),
    ...(answerBlocks ? {
      answerBlocks,
      analysisSections: answerBlocks.map((block) => ({
        id: block.id,
        title: block.title,
        summary: block.summary,
        findings: block.findings,
        citationIds: block.citationIds,
      })),
    } : {}),
  };
}

function mapAnswerBlockText(block: ResearchAnswerBlock, transform: (value: string) => string): ResearchAnswerBlock {
  const mapClaims = (claims?: Array<{ text: string; citationIds: string[] }>) => claims?.map((claim) => ({ ...claim, text: transform(claim.text) }));
  return {
    ...block,
    summary: transform(block.summary),
    narrative: mapClaims(block.narrative),
    findings: block.findings.map(transform),
    findingClaims: mapClaims(block.findingClaims),
    keyMetrics: block.keyMetrics?.filter((metric) => !/(?:主要指数|市场|两市).{0,8}(?:合计)?成交额|主要指数合计成交/.test(`${metric.label} ${metric.context}`)),
    counterpoints: mapClaims(block.counterpoints),
    implications: mapClaims(block.implications),
  };
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeMarketResearchText(value: string) {
  const sentences = value.match(/[^。！？]+[。！？]?/g) ?? [value];
  const kept = sentences.filter((sentence) => !/(?:投资者.{0,16}(?:应|宜)|建议.{0,16}(?:买入|卖出|加仓|减仓|仓位|低吸|追高)|(?:控制|调整|保持).{0,6}仓位|轻仓|重仓|空仓|(?:主要指数|市场)成交额合计|主要指数合计成交)/.test(sentence));
  return kept.join("").trim() || "本轮仅给出证据支持的市场观察，不提供仓位或交易指令。";
}

function normalizeAnswerBlocks(
  value: unknown,
  catalog: ResearchCitation[],
  stages: ResearchAgentStage[],
  catalysts: { values: string[]; citationIds: string[] },
  risks: { values: string[]; citationIds: string[] },
  plan?: ResearchPlan,
): ResearchAnswerBlock[] {
  const allowedIds = new Set(catalog.map((citation) => citation.id));
  const rawSections = Array.isArray(value) ? value.filter(isRecord) : [];
  const sections = rawSections.map((candidate, index): ResearchAnswerBlock | null => {
    const findingClaims = groundedClaimObjects(candidate.findings, allowedIds);
    const narrative = groundedClaimObjects(candidate.narrative, allowedIds);
    const counterpoints = groundedClaimObjects(candidate.counterpoints, allowedIds);
    const implications = groundedClaimObjects(candidate.implications, allowedIds);
    const keyMetrics = normalizeAnswerMetrics(candidate.keyMetrics, allowedIds);
    const citationIds = [...new Set([
      ...validCitationIds(candidate.citationIds, allowedIds),
      ...findingClaims.flatMap((claim) => claim.citationIds),
      ...narrative.flatMap((claim) => claim.citationIds),
      ...counterpoints.flatMap((claim) => claim.citationIds),
      ...implications.flatMap((claim) => claim.citationIds),
      ...keyMetrics.flatMap((metric) => metric.citationIds),
    ])];
    if (citationIds.length === 0 || findingClaims.length + narrative.length + keyMetrics.length === 0) return null;
    const candidateId = textValue(candidate.id, `block-${index + 1}`);
    const layout = plan?.answerLayout.find((item) => item.id === candidateId) ?? plan?.answerLayout[index];
    return {
      id: candidateId,
      title: textValue(candidate.title, layout?.title ?? `研究发现 ${index + 1}`),
      kind: answerBlockKind(candidate.kind, layout?.kind),
      summary: textValue(candidate.summary, narrative[0]?.text ?? findingClaims[0]?.text ?? ""),
      confidence: confidenceValue(candidate.confidence),
      narrative,
      findings: findingClaims.map((claim) => claim.text),
      findingClaims,
      keyMetrics,
      counterpoints,
      implications,
      citationIds,
    };
  }).filter((section): section is ResearchAnswerBlock => section !== null);
  if (sections.length > 0) return sections;

  const derived: ResearchAnswerBlock[] = stages.filter((stage) => stage.findings.length > 0 && (stage.citationIds?.length ?? 0) > 0).map((stage) => {
    const stageCitationIds = stage.citationIds ?? [];
    return {
      id: stage.id,
      title: plan?.tasks.find((task) => task.id === stage.id)?.name.replace(/\s*Agent$/i, "") ?? stage.name,
      kind: stage.id.startsWith("skill:") ? "method" as const : stage.id.includes("risk") || stage.id.includes("counter") ? "risk" as const : "analysis" as const,
      summary: stage.summary,
      confidence: stage.confidence,
      narrative: [{ text: stage.summary, citationIds: stageCitationIds }],
      findings: stage.findings,
      findingClaims: stage.findings.map((text) => ({ text, citationIds: stageCitationIds })),
      keyMetrics: [],
      counterpoints: [],
      implications: [],
      citationIds: stageCitationIds,
    };
  });
  if (catalysts.values.length > 0 && !derived.some((section) => section.id === "catalyst")) {
    derived.push({ id: "catalyst", title: "催化兑现线索", kind: "analysis", summary: catalysts.values[0]!, confidence: "中", narrative: [], findings: catalysts.values, findingClaims: catalysts.values.map((text) => ({ text, citationIds: catalysts.citationIds })), keyMetrics: [], counterpoints: [], implications: [], citationIds: catalysts.citationIds });
  }
  if (risks.values.length > 0 && !derived.some((section) => section.kind === "risk")) {
    derived.push({ id: "risk", title: "反证与失效条件", kind: "risk", summary: risks.values[0]!, confidence: "中", narrative: [], findings: risks.values, findingClaims: risks.values.map((text) => ({ text, citationIds: risks.citationIds })), keyMetrics: [], counterpoints: [], implications: [], citationIds: risks.citationIds });
  }
  return derived;
}

function groundedClaimObjects(value: unknown, allowedIds: Set<string>) {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item) => ({
    text: textValue(item.statement, textValue(item.text, "")),
    citationIds: validCitationIds(item.citationIds, allowedIds),
  })).filter((claim) => claim.text && claim.citationIds.length > 0);
}

function normalizeAnswerMetrics(value: unknown, allowedIds: Set<string>): ResearchAnswerMetric[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((item): ResearchAnswerMetric => ({
    label: textValue(item.label, ""),
    value: textValue(item.value, ""),
    context: textValue(item.context, ""),
    direction: item.direction === "positive" || item.direction === "negative" ? item.direction : "neutral",
    citationIds: validCitationIds(item.citationIds, allowedIds),
  })).filter((metric) => metric.label && metric.value && metric.citationIds.length > 0).slice(0, 6);
}

function answerBlockKind(value: unknown, fallback?: ResearchAnswerBlock["kind"]): ResearchAnswerBlock["kind"] {
  return value === "method" || value === "comparison" || value === "scenario" || value === "risk" || value === "evidence" || value === "checklist"
    ? value
    : fallback ?? "analysis";
}

function normalizeDecisionDashboard(value: unknown, allowedIds: Set<string>): ResearchDecisionDashboard | undefined {
  if (!isRecord(value)) return undefined;
  const citationIds = validCitationIds(value.citationIds, allowedIds);
  if (citationIds.length === 0) return undefined;
  return {
    signal: textValue(value.signal, "谨慎跟踪"),
    timeSensitivity: textValue(value.timeSensitivity, "等待进一步证据"),
    noPosition: textValue(value.noPosition, "证据未充分前不依据本报告建立交易仓位。"),
    hasPosition: textValue(value.hasPosition, "结合自身成本与风险承受能力，重点跟踪风险和失效条件。"),
    watchConditions: stringList(value.watchConditions, ["核验最新公告、财务与行情数据"]),
    citationIds,
  };
}

function normalizeAgentStage(
  candidate: Record<string, unknown>,
  blueprint: Pick<ResearchAgentStage, "id" | "name" | "mission">,
  catalog: ResearchCitation[],
): ResearchAgentStage {
  const allowedIds = new Set(catalog.map((citation) => citation.id));
  const findings = groundedClaims(candidate.findings, allowedIds);
  const citationIds = [...new Set([...validCitationIds(candidate.citationIds, allowedIds), ...findings.citationIds])];
  const grounded = citationIds.length > 0;
  return {
    ...blueprint,
    summary: grounded ? textValue(candidate.summary, "当前资料不足，结论待补。") : "当前资料不足，未形成可引用结论。",
    findings: findings.values,
    confidence: grounded ? confidenceValue(candidate.confidence) : "低",
    evidenceGaps: stringList(candidate.evidenceGaps, ["待补充年报、公告或研报证据"]),
    citationIds,
  };
}

function groundedClaims(value: unknown, allowedIds: Set<string>) {
  if (!Array.isArray(value)) return { values: [] as string[], citationIds: [] as string[] };
  const values: string[] = [];
  const citationIds: string[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const statement = textValue(item.statement, textValue(item.text, ""));
    const validIds = validCitationIds(item.citationIds, allowedIds);
    if (!statement || validIds.length === 0) continue;
    values.push(statement);
    citationIds.push(...validIds);
  }
  return { values, citationIds: [...new Set(citationIds)] };
}

function validCitationIds(value: unknown, allowedIds: Set<string>) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && allowedIds.has(item)))];
}

function countUnsupportedClaims(value: Record<string, unknown>, rawStages: Record<string, unknown>[], allowedIds: Set<string>): number {
  const rows = [value.catalysts, value.risks, ...rawStages.map((stage) => stage.findings)];
  return rows.reduce<number>((sum, row) => sum + countUnsupportedClaimRows(row, allowedIds), 0);
}

function countUnsupportedAnalysisSections(value: unknown, allowedIds: Set<string>) {
  if (!Array.isArray(value)) return 0;
  return value.filter(isRecord).reduce((sum, section) => (
    sum
    + countUnsupportedClaimRows(section.findings, allowedIds)
    + countUnsupportedClaimRows(section.narrative, allowedIds)
    + countUnsupportedClaimRows(section.counterpoints, allowedIds)
    + countUnsupportedClaimRows(section.implications, allowedIds)
    + countUnsupportedClaimRows(section.keyMetrics, allowedIds)
    + (validCitationIds(section.citationIds, allowedIds).length === 0 && textValue(section.summary, "") ? 1 : 0)
  ), 0);
}

function countUnsupportedStageClaims(value: Record<string, unknown>, allowedIds: Set<string>): number {
  return countUnsupportedClaimRows(value.findings, allowedIds);
}

function countUnsupportedClaimRows(value: unknown, allowedIds: Set<string>): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((item) => {
    if (typeof item === "string") return true;
    if (!isRecord(item)) return false;
    return validCitationIds(item.citationIds, allowedIds).length === 0;
  }).length;
}

function normalizeAnswerMarkdown(value: unknown, allowedIds: Set<string>) {
  if (typeof value !== "string") return "";
  const markdown = value.trim().replace(/^```(?:markdown|md)?\s*|\s*```$/gi, "").trim();
  if (!markdown) return "";
  return markdown.replace(/\[([^\]\n]{1,180})\]/g, (token, id: string) => {
    if (allowedIds.has(id)) return token;
    return /^(?:evidence|field|profile|timeline|graph|note|relation):/i.test(id) ? "" : token;
  });
}

function extractMarkdownCitationIds(markdown: string, allowedIds: Set<string>) {
  if (!markdown) return [];
  return [...allowedIds].filter((id) => markdown.includes(`[${id}]`));
}

function buildNaturalAnswerMarkdown(input: {
  thesis: string;
  investmentValue: string;
  answerBlocks: ResearchAnswerBlock[];
}) {
  const blocks = input.answerBlocks.flatMap((block) => {
    const claims = block.narrative?.length
      ? block.narrative
      : block.findingClaims?.length
        ? block.findingClaims
        : block.findings.map((text) => ({ text, citationIds: block.citationIds }));
    if (!claims.length) return [];
    const body = claims.map((claim) => `${claim.text}${formatClaimCitations(claim.citationIds)}`).join("\n\n");
    return [`## ${block.title}\n\n${body}`];
  });
  return [input.thesis, input.investmentValue, ...blocks].filter(Boolean).join("\n\n");
}

function buildEvidenceFallbackAnswer(input: {
  question: string;
  subject: string;
  citations: ResearchCitation[];
  reason: string;
  marketFallback: boolean;
}) {
  const question = input.question.trim().replace(/\s+/g, " ").slice(0, 160);
  if (!input.citations.length) {
    return `我暂时无法完成“${question}”的有效研判：模型服务当前不可用，同时没有取得足够的可追溯资料。\n\n这不是分析结论。请在模型服务恢复或补充数据后重新提问。`;
  }
  const evidenceLines = input.citations.slice(0, 8).map((citation) => (
    `- ${formatFallbackEvidenceFinding(citation)} [${citation.id}]`
  ));
  const scope = input.marketFallback ? "指数、板块与市场情报" : `${input.subject}相关资料`;
  return [
    `我暂时无法对“${question}”生成完整的 AI 判断，因为模型服务当前不可用。下面只列出已经取得的${scope}，不把数据摘要冒充结论。`,
    ...evidenceLines,
    `目前能确认的范围仅限上述资料；${input.reason || "模型恢复后可重新执行自由问答与多 Agent 交叉验证"}。`,
  ].join("\n\n");
}

function researchMessages(payload: Record<string, unknown>) {
  return [
    {
      role: "system",
      content:
        "你是金融领域深度研究智能体。facts.subject 是本次唯一研究对象：它可能是公司、行业、A股大盘、跨市场证券或开放问题。必须先判断 subject.kind 与 facts.company.subjectType，再按用户原始问题选择研究角色和回答方式；不得把问题改写成固定的公司体检或固定报告目录。answerMarkdown 是最终直接展示给用户的答案：必须先直接回应用户真正问的内容，再按信息量自由组织 Markdown；可短可长，可使用段落、少量小标题、表格或清单，但不得机械重复“核心结论/关键指标/风险反证/下一步核验”等固定章节，也不得逐个复述所选方法形成方法作业，更不得暴露内部规划、Agent 名称或 JSON 结构。用户显式选择的方法是分析视角：应把它们的共识、分歧和适用边界自然融入结论；未选择的方法不得强行加入。conversationHistory 若属于其他对象，不得混入当前结果。对于概念解释、分析方法、计算逻辑等非时效性通用金融知识，可以使用专业知识直接回答并明确其为通用说明；涉及具体公司、行情、财务数字、新闻、政策、预测和其他时效性事实时，只能使用输入 facts 与 evidenceCatalog，不得用模型记忆补全。遵循 sourcePolicy 的首选、补充与避坑规则：低等级信源只能形成线索，不能替代高等级原始证据。财经快讯只能作为事件线索，涉及政策、公司行动或业绩时应明确仍需回到监管、交易所或公司公告原文核验。answerMarkdown 中每项可核验事实在相关句末用 `[citationId]` 标注，citationId 必须存在于 evidenceCatalog；没有证据时直接说明边界。大盘研判时：marketIndices 只证明 quoteTime 对应交易时刻的点位与当日涨跌，不能把周末或盘后 fetchedAt 写成行情时间；marketBreadth 才能证明涨跌家数和市场广度，其中 strongUpCount/strongDownCount 的阈值是涨跌幅绝对值 9.8%，不得改写成 5%；marketTechnicalSnapshots 才能用于均线、MACD、RSI、支撑阻力、缠论或波浪等历史结构判断；缺少对应字段时必须明确该方法未执行，严禁依据单点行情猜测中枢、浪型、均线或支撑位。指数方向必须与 changePercent 正负号完全一致；amountYi 的单位固定为亿元，不得再次换算或标成万元。日期必须区分行情交易时刻、资料获取时刻与最近完整交易日。社区、自媒体或低可信来源不能证明实时涨跌家数、板块主线、政策事实或资金流。禁止虚构精确数字、客户、订单和财务指标。外层仍输出严格 JSON，不输出收益承诺。",
    },
    { role: "user", content: JSON.stringify(payload) },
  ];
}

function specialistOutputSchema(id: string, citationExample = "SRC1") {
  return {
    id,
    summary: "有证据支持的简要判断",
    findings: [{ statement: "事实或判断", citationIds: [citationExample] }],
    citationIds: [citationExample],
    confidence: "高/中/低",
    evidenceGaps: ["缺少的数据或证据"],
  };
}

function chiefOutputSchema(
  includeStages: boolean,
  blueprints: ResearchAgentBlueprint[],
  citationExample = "SRC1",
) {
  return {
    answerMarkdown: "直接回答用户原始问题的自由 Markdown 正文。结构、篇幅和表达由问题决定；不要套用固定章节，不要介绍内部 Agent 或研究计划；事实句末使用 [citationId]。",
    thesis: "80-160字核心研究判断：回答用户问题、给出最重要的因果链与结论置信边界",
    investmentValue: "200-400字执行摘要：解释结论为何成立、最大分歧、当前最值得跟踪的变量与适用边界，不构成投资建议",
    confidence: "高/中/低",
    citationIds: [citationExample],
    ...(includeStages ? { stages: blueprints.map((stage) => specialistOutputSchema(stage.id, citationExample)) } : { chief: specialistOutputSchema("chief", citationExample) }),
    catalysts: [{ statement: "催化因素", citationIds: [citationExample] }],
    risks: [{ statement: "风险或反证", citationIds: [citationExample] }],
    decisionDashboard: "通常返回 null；仅当用户明确问交易、仓位或决策时，改为包含 signal、timeSensitivity、noPosition、hasPosition、watchConditions、citationIds 的对象",
    verificationQuestions: ["下一步核验问题"],
    evidenceBoundary: "资料范围、时效与限制",
  };
}

function planTaskBlueprint(task: ResearchPlanTask): ResearchAgentBlueprint {
  return {
    id: task.id,
    name: task.name,
    mission: task.mission,
    kind: task.kind,
    skillId: task.skillId,
    evidenceKeywords: task.evidenceKeywords,
    expectedOutput: task.expectedOutput,
  };
}

function skillForPrompt(skill: ResearchSkill) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    requiredData: skill.requiredData,
    instructions: skill.instructions,
  };
}

function compactConversationHistory(
  history: Array<{ role: "user" | "assistant"; content: string }> | undefined,
  limit = 8,
  contentLimit = 2_000,
) {
  return (history ?? []).slice(-limit).map((message) => ({
    role: message.role,
    content: message.content.slice(0, contentLimit),
  }));
}

function buildQuickResearchContext(facts: CompanyResearchFacts) {
  const trustedRelations = facts.relations.filter(isTrustedResearchRelation);
  return {
    subject: facts.subject,
    company: compactModelRecord(facts.company, 12),
    dossierQuality: compactModelRecord(facts.dossierQuality, 10),
    relationSummary: trustedRelations.slice(0, 6).map((row) => compactModelRecord(row, 8)),
  };
}

function buildBoundedResearchContext(facts: CompanyResearchFacts) {
  const trustedRelations = facts.relations.filter(isTrustedResearchRelation);
  return {
    subject: facts.subject,
    company: compactModelRecord(facts.company, 24),
    researchProfile: facts.researchProfile ? compactModelRecord(facts.researchProfile, 20) : null,
    relations: trustedRelations.slice(0, 16).map((row) => compactModelRecord(row, 14)),
    graphRelations: facts.graphRelations.slice(0, 12).map((row) => compactModelRecord(row, 14)),
    dossierQuality: compactModelRecord(facts.dossierQuality, 16),
    notes: facts.notes.slice(0, 6).map((row) => compactModelRecord(row, 10)),
  };
}

function isTrustedResearchRelation(row: Record<string, unknown>) {
  return row.relationType !== "待验证" && row.confidence !== "低";
}

function compactModelRecord(value: Record<string, unknown>, maxEntries: number, depth = 0): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, maxEntries)
      .map(([key, item]) => [key, compactModelValue(item, depth + 1)]),
  );
}

function compactModelValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (depth >= 3) return Array.isArray(value) ? `[${value.length} items]` : "[object]";
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => compactModelValue(item, depth + 1));
  if (isRecord(value)) return compactModelRecord(value, 14, depth);
  return String(value ?? "");
}

function selectEvidenceForRole(
  citations: ResearchCitation[],
  roleId: string,
  limit: number,
  excerptLimit = 600,
  plannedKeywords: string[] = [],
) {
  const keywords = [...new Set([...plannedKeywords, ...roleEvidenceKeywords(roleId)])];
  return [...citations]
    .sort((left, right) => evidenceRoleScore(right, keywords) - evidenceRoleScore(left, keywords))
    .slice(0, limit)
    .map((citation) => ({ ...citation, excerpt: citation.excerpt.slice(0, excerptLimit) }));
}

function aliasEvidenceCatalog(citations: ResearchCitation[]) {
  const aliasToCanonical = new Map<string, string>();
  const canonicalToAlias = new Map<string, string>();
  const catalog = citations.map((citation, index) => {
    const alias = `SRC${index + 1}`;
    aliasToCanonical.set(alias, citation.id);
    canonicalToAlias.set(citation.id, alias);
    return { ...citation, id: alias };
  });
  return {
    catalog,
    aliasToCanonical,
    canonicalToAlias,
    exampleId: catalog[0]?.id ?? "NO_SOURCE",
  };
}

function remapCitationAliases(value: Record<string, unknown>, aliasToCanonical: Map<string, string>) {
  const visit = (item: unknown, key = ""): unknown => {
    if (Array.isArray(item)) {
      if (key === "citationIds") {
        return item.map((id) => typeof id === "string" ? aliasToCanonical.get(id.trim()) ?? id.trim() : id);
      }
      return item.map((child) => visit(child));
    }
    if (typeof item === "string" && key === "answerMarkdown") {
      return item.replace(/\[(?:citation(?:Id)?\s*:\s*)?([^\]\n]+)\]/gi, (token, id: string) => {
        const canonical = aliasToCanonical.get(id.trim());
        return canonical ? `[${canonical}]` : token;
      });
    }
    if (!isRecord(item)) return item;
    return Object.fromEntries(Object.entries(item).map(([childKey, child]) => [childKey, visit(child, childKey)]));
  };
  return visit(value) as Record<string, unknown>;
}

function aliasStageCitations(stage: ResearchAgentStage, canonicalToAlias: Map<string, string>): ResearchAgentStage {
  return {
    ...stage,
    citationIds: (stage.citationIds ?? []).map((id) => canonicalToAlias.get(id) ?? id),
  };
}

function selectChiefEvidence(citations: ResearchCitation[], stages: ResearchAgentStage[]) {
  const referenced = new Set(stages.flatMap((stage) => stage.citationIds ?? []));
  const cited = citations.filter((citation) => referenced.has(citation.id));
  const remaining = citations.filter((citation) => !referenced.has(citation.id));
  return [...cited, ...remaining]
    .slice(0, 32)
    .map((citation) => ({ ...citation, excerpt: citation.excerpt.slice(0, 600) }));
}

function roleEvidenceKeywords(roleId: string) {
  if (roleId.startsWith("skill:")) return ["technical", "kline", "行情", "均线", "macd", "rsi", "量比"];
  return {
    business: ["主营", "业务", "财务", "利润", "收入", "毛利", "现金流", "资产负债", "估值", "公司概况"],
    industry: ["产业", "行业", "上下游", "供应链", "主营", "竞争", "产品"],
    intel: ["公告", "研报", "订单", "客户", "产能", "项目", "新闻", "机构"],
    risk: ["风险", "负债", "现金流", "应收", "估值", "波动", "公告", "利润"],
    quick: ["主营", "财务", "行业", "公告", "研报", "风险", "估值"],
  }[roleId] ?? [];
}

function questionEvidenceKeywords(question: string) {
  const keywords: string[] = [];
  if (/(股价|走势|趋势|行情|涨跌|技术面|技术分析|均线|ma\d*|macd|rsi|k\s*线|量价|成交量|放量|缩量|支撑|压力|阻力|突破|回调)/i.test(question)) {
    keywords.push("technicalSnapshot", "Kline", "均线", "MACD", "RSI", "量比", "支撑", "阻力");
  }
  if (/(基本面|业绩|营收|利润|现金流|负债|估值|市盈率|市净率|pe|pb)/i.test(question)) {
    keywords.push("businessReview", "incomeStatements", "cashFlowStatements", "balanceSheets", "peTtm", "pb");
  }
  if (/(新闻|公告|研报|事件|催化|风险)/i.test(question)) {
    keywords.push("announcements", "researchReports", "newsSearchResult", "风险");
  }
  return keywords;
}

function questionEvidenceRequirement(question: string) {
  if (/(股价|走势|趋势|行情|技术面|技术分析|均线|ma\d*|macd|rsi|k\s*线|量价|成交量|放量|缩量|支撑|压力|阻力|突破|回调)/i.test(question)) {
    return " 若证据目录含 technicalSnapshot，股价或趋势判断必须引用其实际收盘价、均线、量能或动量指标，不得仅用新闻涨跌替代技术分析。";
  }
  return "";
}

function evidenceRoleScore(citation: ResearchCitation, keywords: string[]) {
  const haystack = `${citation.id} ${citation.title} ${citation.sourceType} ${citation.excerpt}`.toLocaleLowerCase();
  return keywords.reduce((score, keyword) => score + (haystack.includes(keyword.toLocaleLowerCase()) ? 1 : 0), 0);
}

function buildToolTrace(facts: CompanyResearchFacts): ResearchExecution["toolTrace"] {
  if (facts.company.subjectType === "market") {
    const marketTools = new Set(["get_market_indices", "get_market_breadth", "get_market_index_history", "get_sector_rankings", "search_comprehensive_intel"]);
    return [
      {
        tool: "evidence_catalog",
        status: facts.fieldFacts.some((fact) => fact.status === "available") ? "completed" as const : "unavailable" as const,
        detail: `市场字段事实 ${facts.fieldFacts.length} 条`,
      },
      ...buildDAStockToolTrace(facts, { includeTechnical: true, includeUnavailable: true })
        .filter((trace) => marketTools.has(trace.tool)),
    ];
  }
  const trustedRelationCount = facts.relations.filter(isTrustedResearchRelation).length;
  return [
    {
      tool: "unified_company_profile",
      status: facts.subject?.kind === "company" ? "completed" as const : "unavailable" as const,
      detail: facts.subject?.kind === "company" ? "已载入公司档案、字段来源与完整度" : "当前不是公司研究",
    },
    {
      tool: "industry_graph",
      status: trustedRelationCount > 0 ? "completed" as const : "unavailable" as const,
      detail: trustedRelationCount > 0 ? `已载入 ${trustedRelationCount} 条已核验产业关系` : "没有已核验产业关系",
    },
    {
      tool: "evidence_catalog",
      status: facts.evidence.length > 0 || facts.fieldFacts.length > 0 ? "completed" as const : "unavailable" as const,
      detail: `关系证据 ${facts.evidence.length} 条，字段事实 ${facts.fieldFacts.length} 条`,
    },
    ...buildDAStockToolTrace(facts, { includeTechnical: true, includeUnavailable: true }),
  ];
}

function confidenceValue(value: unknown): "高" | "中" | "低" {
  return value === "高" || value === "低" ? value : "中";
}

function textValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const rows = value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  return rows.length > 0 ? rows : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

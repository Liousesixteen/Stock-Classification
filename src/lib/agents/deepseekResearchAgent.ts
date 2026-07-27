import { buildResearchEvidenceCatalog, type ResearchCitation } from "@/lib/research/researchEvidenceCatalog";
import type {
  ResearchReportChart,
  ResearchReportQuality,
  ResearchReportType,
} from "@/lib/repositories/researchDocuments";

type DeepSeekConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

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
  id: "business" | "industry" | "intel" | "risk" | "chief";
  name: string;
  mission: string;
  summary: string;
  findings: string[];
  confidence: "高" | "中" | "低";
  evidenceGaps: string[];
  citationIds?: string[];
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
};

export type DeepResearchResult = {
  thesis: string;
  investmentValue: string;
  confidence: "高" | "中" | "低";
  stages: ResearchAgentStage[];
  catalysts: string[];
  risks: string[];
  verificationQuestions: string[];
  evidenceBoundary: string;
  model: string;
  citations?: ResearchCitation[];
  unsupportedClaimCount?: number;
  execution?: ResearchExecution;
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
const STAGE_BLUEPRINTS: Array<Pick<ResearchAgentStage, "id" | "name" | "mission">> = [
  { id: "business", name: "基本面 Agent", mission: "识别主营业务、收入结构、竞争优势与经营变量" },
  { id: "industry", name: "产业链 Agent", mission: "判断公司所处环节、上下游关系、行业格局与替代逻辑" },
  { id: "intel", name: "情报 Agent", mission: "梳理催化因素、公告线索、客户与订单验证方向" },
  { id: "risk", name: "风险 Agent", mission: "反向检查事实缺口、周期风险、估值与事件风险" },
  { id: "chief", name: "主审 Agent", mission: "交叉验证各角色结论并形成可执行研究判断" },
];

const SPECIALIST_BLUEPRINTS = STAGE_BLUEPRINTS.filter((stage) => stage.id !== "chief");
const MODE_LIMITS: Record<ResearchDepth, { maxAgentCalls: number; specialistTokens: number; chiefTokens: number; timeoutMs: number }> = {
  quick: { maxAgentCalls: 1, specialistTokens: 0, chiefTokens: 1800, timeoutMs: 18_000 },
  standard: { maxAgentCalls: 5, specialistTokens: 1100, chiefTokens: 2400, timeoutMs: 24_000 },
  deep: { maxAgentCalls: 5, specialistTokens: 1800, chiefTokens: 3600, timeoutMs: 28_000 },
};

export async function runDeepResearchTeam(
  facts: CompanyResearchFacts,
  input: { question: string; depth: ResearchDepth },
  config: DeepSeekConfig = {},
  fetcher: AgentFetcher = fetch,
): Promise<DeepResearchResult> {
  const model = config.model ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
  const startedAt = Date.now();
  const limits = MODE_LIMITS[input.depth];
  const citations = buildResearchEvidenceCatalog(facts);
  const question = input.question || "当前研究对象的真实产业位置、核心价值、催化与主要风险是什么？";

  if (input.depth === "quick") {
    const call = await callDeepSeekJson(
      researchMessages({
        task: "快速联合研判",
        question,
        roles: STAGE_BLUEPRINTS,
        facts,
        evidenceCatalog: citations,
        outputSchema: chiefOutputSchema(true),
      }),
      { ...config, model },
      limits.chiefTokens,
      limits.timeoutMs,
      fetcher,
    );
    return normalizeResearchResult(call.data, model, citations, {
      mode: input.depth,
      agentCalls: 1,
      maxAgentCalls: limits.maxAgentCalls,
      totalTokens: call.totalTokens,
      maxOutputTokens: limits.chiefTokens,
      elapsedMs: Date.now() - startedAt,
      timeoutMs: limits.timeoutMs,
    });
  }

  const allowedIds = new Set(citations.map((citation) => citation.id));
  const specialistCalls = await Promise.all(SPECIALIST_BLUEPRINTS.map(async (blueprint) => {
    const call = await callDeepSeekJson(
      researchMessages({
        task: "独立专家研判",
        question,
        role: blueprint,
        facts,
        evidenceCatalog: citations,
        outputSchema: specialistOutputSchema(blueprint.id),
      }),
      { ...config, model },
      limits.specialistTokens,
      limits.timeoutMs,
      fetcher,
    );
    return {
      call,
      stage: normalizeAgentStage(call.data, blueprint, citations),
      unsupportedClaimCount: countUnsupportedStageClaims(call.data, allowedIds),
    };
  }));

  const chiefCall = await callDeepSeekJson(
    researchMessages({
      task: "主审交叉验证",
      question,
      role: STAGE_BLUEPRINTS.at(-1),
      specialistResults: specialistCalls.map((row) => row.stage),
      evidenceCatalog: citations,
      outputSchema: chiefOutputSchema(false),
    }),
    { ...config, model },
    limits.chiefTokens,
    limits.timeoutMs,
    fetcher,
  );
  const specialistStages = specialistCalls.map((row) => row.stage);
  const chiefStage = normalizeAgentStage(
    isRecord(chiefCall.data.chief) ? chiefCall.data.chief : chiefCall.data,
    STAGE_BLUEPRINTS.at(-1)!,
    citations,
  );
  const totalTokens = specialistCalls.reduce((sum, row) => sum + row.call.totalTokens, chiefCall.totalTokens);
  return normalizeResearchResult(chiefCall.data, model, citations, {
    mode: input.depth,
    agentCalls: specialistCalls.length + 1,
    maxAgentCalls: limits.maxAgentCalls,
    totalTokens,
    maxOutputTokens: limits.specialistTokens * specialistCalls.length + limits.chiefTokens,
    elapsedMs: Date.now() - startedAt,
    timeoutMs: limits.timeoutMs,
  }, [...specialistStages, chiefStage], specialistCalls.reduce((sum, row) => sum + row.unsupportedClaimCount, 0));
}

export async function generateResearchReport(
  facts: CompanyResearchFacts,
  analysis: DeepResearchResult | null,
  input: { reportType: ResearchReportType; focus: string },
  config: DeepSeekConfig = {},
  fetcher: AgentFetcher = fetch,
): Promise<ResearchReportResult> {
  const model = config.model ?? process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;
  const catalog = buildResearchEvidenceCatalog(facts);
  const outline = reportOutline(input.reportType);
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
  return normalizeResearchReport(call.data, facts, analysis, input.reportType, outline, catalog, model);
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
  if (reportType === "industry") return ["研究摘要", "赛道定义与边界", "产业链结构", "供需与景气", "竞争格局与公司映射", "催化因素", "风险与反证", "跟踪指标与结论"];
  if (reportType === "comparison") return ["对比摘要", "公司与业务口径", "产业链位置对比", "经营与财务对比", "竞争优势对比", "催化因素对比", "风险与反证", "结论与待验证事项"];
  if (reportType === "event") return ["事件摘要", "事实与证据", "影响传导路径", "公司与产业链影响", "情景分析", "后续跟踪节点", "风险与反证", "结论"];
  return ["投资摘要", "公司概览", "主营业务与收入构成", "产业链位置", "竞争优势", "财务与估值", "催化因素", "风险与反证", "结论与待验证事项"];
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
  const response = await fetcher(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, response_format: { type: "json_object" }, temperature: 0.15, max_tokens: maxTokens, stream: false }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`DeepSeek 调用失败：${response.status}`);
  const payload = (await response.json()) as DeepSeekResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 未返回研究结果");
  return {
    data: JSON.parse(content) as Record<string, unknown>,
    totalTokens: payload.usage?.total_tokens ?? (payload.usage?.prompt_tokens ?? 0) + (payload.usage?.completion_tokens ?? 0),
  };
}

function normalizeResearchResult(
  value: Record<string, unknown>,
  model: string,
  catalog: ResearchCitation[],
  execution: ResearchExecution,
  providedStages?: ResearchAgentStage[],
  unsupportedClaimOffset = 0,
): DeepResearchResult {
  const rawStages = Array.isArray(value.stages) ? value.stages.filter(isRecord) : [];
  const stages = providedStages ?? STAGE_BLUEPRINTS.map((blueprint) =>
    normalizeAgentStage(rawStages.find((stage) => stage.id === blueprint.id) ?? {}, blueprint, catalog),
  );
  const allowedIds = new Set(catalog.map((citation) => citation.id));
  const chiefIds = validCitationIds(value.citationIds, allowedIds);
  const catalystClaims = groundedClaims(value.catalysts, allowedIds);
  const riskClaims = groundedClaims(value.risks, allowedIds);
  const referencedIds = new Set([
    ...chiefIds,
    ...stages.flatMap((stage) => stage.citationIds),
    ...catalystClaims.citationIds,
    ...riskClaims.citationIds,
  ]);
  const hasGrounding = chiefIds.length > 0;
  return {
    thesis: hasGrounding ? textValue(value.thesis, "当前资料不足，建议先完成证据核验。") : "当前没有足够的可引用证据形成研究结论。",
    investmentValue: hasGrounding ? textValue(value.investmentValue, "具备进一步调研价值，结论仍待证据验证。") : "应先补充可追溯资料，再评估后续调研价值。",
    confidence: hasGrounding ? confidenceValue(value.confidence) : "低",
    stages,
    catalysts: catalystClaims.values.length ? catalystClaims.values : ["催化因素待验证"],
    risks: riskClaims.values.length ? riskClaims.values : ["业务与行业风险待验证"],
    verificationQuestions: stringList(value.verificationQuestions, ["核心业务收入占比和毛利率是多少？"]),
    evidenceBoundary: textValue(value.evidenceBoundary, "仅基于当前本地资料整理，缺失信息未作推断。"),
    model,
    citations: catalog.filter((citation) => referencedIds.has(citation.id)),
    unsupportedClaimCount: unsupportedClaimOffset
      + countUnsupportedClaims(value, rawStages, allowedIds)
      + stages.filter((stage) => (stage.citationIds?.length ?? 0) === 0).length,
    execution,
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

function researchMessages(payload: Record<string, unknown>) {
  return [
    {
      role: "system",
      content:
        "你是A股产业研究智能体。只能使用输入 facts 与 evidenceCatalog，不得使用模型记忆补全事实。每条事实性 finding、催化和风险都必须返回 evidenceCatalog 中存在的 citationIds；没有证据则写入 evidenceGaps 或 verificationQuestions。禁止虚构精确数字、客户、订单和财务指标。输出严格JSON，不输出投资建议或收益承诺。",
    },
    { role: "user", content: JSON.stringify(payload) },
  ];
}

function specialistOutputSchema(id: ResearchAgentStage["id"]) {
  return {
    id,
    summary: "有证据支持的简要判断",
    findings: [{ statement: "事实或判断", citationIds: ["evidence:1"] }],
    citationIds: ["evidence:1"],
    confidence: "高/中/低",
    evidenceGaps: ["缺少的数据或证据"],
  };
}

function chiefOutputSchema(includeStages: boolean) {
  return {
    thesis: "一句话研究判断",
    investmentValue: "潜在调研价值，不构成投资建议",
    confidence: "高/中/低",
    citationIds: ["evidence:1"],
    ...(includeStages ? { stages: STAGE_BLUEPRINTS.map((stage) => specialistOutputSchema(stage.id)) } : { chief: specialistOutputSchema("chief") }),
    catalysts: [{ statement: "催化因素", citationIds: ["evidence:1"] }],
    risks: [{ statement: "风险或反证", citationIds: ["evidence:1"] }],
    verificationQuestions: ["下一步核验问题"],
    evidenceBoundary: "资料范围、时效与限制",
  };
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

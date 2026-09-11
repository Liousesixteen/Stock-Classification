import type { CompanyResearchFacts, ResearchDepth } from "@/lib/agents/deepseekResearchAgent";
import type { ResearchSkill } from "@/lib/agents/researchSkills";
import { inferMarketResearchTarget } from "@/lib/research/researchTarget";

export type ResearchPlanTaskKind = "domain" | "method" | "verification" | "counter";

export type ResearchPlanTask = {
  id: string;
  name: string;
  mission: string;
  reason: string;
  kind: ResearchPlanTaskKind;
  skillId?: string;
  evidenceKeywords: string[];
  expectedOutput: string;
};

export type ResearchPlanLayout = {
  id: string;
  title: string;
  kind: "analysis" | "method" | "comparison" | "scenario" | "risk" | "evidence" | "checklist";
  question: string;
};

export type ResearchPlan = {
  objective: string;
  targetLabel: string;
  rationale: string;
  tasks: ResearchPlanTask[];
  answerLayout: ResearchPlanLayout[];
  synthesisCriteria: string[];
};

export type ResearchAnswerBlock = {
  id: string;
  title: string;
  kind: ResearchPlanLayout["kind"];
  summary: string;
  confidence?: "高" | "中" | "低";
  narrative?: ResearchAnswerClaim[];
  findings: string[];
  findingClaims?: ResearchAnswerClaim[];
  keyMetrics?: ResearchAnswerMetric[];
  counterpoints?: ResearchAnswerClaim[];
  implications?: ResearchAnswerClaim[];
  citationIds: string[];
};

export type ResearchAnswerClaim = {
  text: string;
  citationIds: string[];
};

export type ResearchAnswerMetric = {
  label: string;
  value: string;
  context: string;
  direction: "positive" | "negative" | "neutral";
  citationIds: string[];
};

type PlanInput = {
  question: string;
  depth: ResearchDepth;
  skills: ResearchSkill[];
  facts: CompanyResearchFacts;
};

const CORE_TASKS: ResearchPlanTask[] = [
  {
    id: "business-quality",
    name: "业务与经营质量 Agent",
    mission: "核验主营结构、盈利质量、现金流和关键经营变量，只保留与用户问题相关的部分。",
    reason: "建立公司事实底座，避免技术形态或题材判断脱离经营现实。",
    kind: "domain",
    evidenceKeywords: ["主营", "业务", "收入", "利润", "毛利", "现金流", "财务", "公司概况"],
    expectedOutput: "业务事实、经营质量判断和待核验缺口",
  },
  {
    id: "industry-catalyst",
    name: "产业与催化 Agent",
    mission: "核验产业链位置、竞争格局、供需变量、公告事件和催化兑现路径。",
    reason: "把公司变化放回产业周期和事件传导链条中判断。",
    kind: "domain",
    evidenceKeywords: ["产业", "行业", "上下游", "竞争", "供需", "公告", "订单", "项目", "新闻"],
    expectedOutput: "产业位置、催化路径和兑现条件",
  },
  {
    id: "market-valuation",
    name: "市场与估值 Agent",
    mission: "核验行情、估值、资金、相对强弱和市场预期，仅在数据充分时给出时点判断。",
    reason: "识别基本面预期与价格表现之间是否存在错位。",
    kind: "domain",
    evidenceKeywords: ["行情", "估值", "PE", "PB", "换手", "资金流", "均线", "K线", "研报"],
    expectedOutput: "估值与市场信号、适用窗口和失效条件",
  },
  {
    id: "counter-evidence",
    name: "反证与风险 Agent",
    mission: "主动寻找冲突证据、数据缺口、替代解释、风险暴露和结论失效条件。",
    reason: "对抗单向叙事并校准结论置信度。",
    kind: "counter",
    evidenceKeywords: ["风险", "负债", "现金流", "波动", "减值", "诉讼", "监管", "不确定"],
    expectedOutput: "最强反证、风险排序和失效条件",
  },
];

const GENERAL_KNOWLEDGE_TASK: ResearchPlanTask = {
  id: "financial-knowledge",
  name: "金融知识解释 Agent",
  mission: "直接理解用户的金融问题，以与其知识水平匹配的方式解释概念、机制、计算或差异；只在问题需要时使用例子、公式和注意事项。",
  reason: "这是开放式金融知识问题，不应被改写成公司基本面或固定研报任务。",
  kind: "domain",
  evidenceKeywords: ["定义", "概念", "原理", "计算", "区别", "解释", "例子", "金融"],
  expectedOutput: "围绕原始问题自然组织的直接回答",
};

const MARKET_TASKS: ResearchPlanTask[] = [
  {
    id: "market-index-trend",
    name: "指数与趋势 Agent",
    mission: "读取主要指数的涨跌、位置和量价状态，判断当前市场方向及持续条件。",
    reason: "对应主要指数工具与大盘研判路径。",
    kind: "domain",
    evidenceKeywords: ["大盘", "指数", "走势", "趋势", "上证", "深证", "创业板", "沪深300"],
    expectedOutput: "指数状态、市场方向、关键观察位置和数据边界",
  },
  {
    id: "market-breadth-rotation",
    name: "市场广度与轮动 Agent",
    mission: "分析行业涨跌排名、领涨与领跌方向、风格分化和板块轮动持续性。",
    reason: "对应行业强弱与板块轮动工具。",
    kind: "domain",
    evidenceKeywords: ["板块", "行业", "轮动", "广度", "风格", "涨跌家数", "主线"],
    expectedOutput: "市场广度、领涨领跌结构与主线强弱",
  },
  {
    id: "market-catalyst-news",
    name: "政策与市场情报 Agent",
    mission: "检索并核验影响A股风险偏好的政策、宏观、资金和重大事件，只保留可追溯信息。",
    reason: "调用开放情报搜索能力补充可追溯证据。",
    kind: "domain",
    evidenceKeywords: ["政策", "宏观", "资金", "新闻", "事件", "情绪", "风险偏好"],
    expectedOutput: "驱动因素、事件传导路径与时效性",
  },
  {
    id: "market-counter-scenario",
    name: "市场反证与情景 Agent",
    mission: "给出偏强、震荡和转弱情景，识别最强反证、失效条件与下一观察窗口。",
    reason: "避免仅凭单日涨跌预测未来市场。",
    kind: "counter",
    evidenceKeywords: ["风险", "走势", "后市", "明日", "本周", "未来", "情景", "失效"],
    expectedOutput: "多情景判断、反证、失效条件和跟踪清单",
  },
];

export function buildFallbackResearchPlan(input: PlanInput): ResearchPlan {
  const targetLabel = input.facts.subject?.label || input.facts.subject?.key || "当前研究对象";
  const maxTasks = taskLimit(input);
  const methodTasks = input.skills.map(skillTask);
  const questionTasks = selectCoreTasks(input.question, input.depth);
  const tasks = dedupeTasks([...methodTasks, ...questionTasks]).slice(0, maxTasks);
  const answerLayout = buildAnswerLayout(input.question, tasks, input.skills);

  return {
    objective: `${targetLabel}：${input.question}`.slice(0, 180),
    targetLabel,
    rationale: input.skills.length
      ? `优先执行用户选择的 ${input.skills.map((skill) => skill.name).join("、")}，并用领域证据与反证任务交叉校验。`
      : isGeneralFinancialKnowledgeQuestion(input.question)
        ? "保留用户原始问题，由金融知识解释角色直接回答；不套用个股研报章节。"
      : "根据问题意图选择最相关的领域任务，并由反证任务校准结论。",
    tasks,
    answerLayout,
    synthesisCriteria: [
      "事实性判断必须绑定有效引用",
      "区分已证实事实、分析推断和待核验假设",
      "方法结论必须说明条件是否满足及失效边界",
      "存在冲突证据时降低置信度并显式展示",
    ],
  };
}

export function normalizeResearchPlan(value: unknown, input: PlanInput): ResearchPlan {
  const fallback = buildFallbackResearchPlan(input);
  if (!isRecord(value)) return fallback;
  const maxTasks = taskLimit(input);
  const rawTasks = Array.isArray(value.tasks) ? value.tasks.filter(isRecord) : [];
  const modelTasks = rawTasks.map((task, index): ResearchPlanTask | null => {
    const mission = text(task.mission);
    const name = text(task.name);
    if (!mission || !name) return null;
    const kind = task.kind === "method" || task.kind === "verification" || task.kind === "counter"
      ? task.kind
      : "domain";
    return {
      id: safeId(text(task.id) || `task-${index + 1}`),
      name: name.slice(0, 50),
      mission: mission.slice(0, 320),
      reason: text(task.reason).slice(0, 220) || "由规划 Agent 根据问题选择",
      kind,
      ...(typeof task.skillId === "string" && task.skillId.trim() ? { skillId: task.skillId.trim() } : {}),
      evidenceKeywords: stringList(task.evidenceKeywords, 10),
      expectedOutput: text(task.expectedOutput).slice(0, 160) || "有引用的判断、反证与证据缺口",
    };
  }).filter((task): task is ResearchPlanTask => task !== null);

  // Explicitly selected methods are a request contract. A planner may reorder
  // them, but may not silently omit them.
  const requiredMethods = input.skills.map(skillTask);
  const tasks = dedupeTasks(modelTasks.length
    ? [...requiredMethods, ...modelTasks]
    : fallback.tasks).slice(0, maxTasks);
  const domainFallback = fallback.tasks.find((task) => task.kind === "domain" || task.kind === "verification");
  if (domainFallback && !tasks.some((task) => task.kind === "domain" || task.kind === "verification") && tasks.length < maxTasks) {
    tasks.push(domainFallback);
  }
  const counterFallback = (inferMarketResearchTarget(input.question) ? MARKET_TASKS : CORE_TASKS)
    .find((task) => task.kind === "counter")!;
  if (!isGeneralFinancialKnowledgeQuestion(input.question)
    && !tasks.some((task) => task.kind === "counter" || task.kind === "verification")) {
    if (tasks.length < maxTasks) tasks.push(counterFallback);
    else {
      let replaceIndex = -1;
      for (let index = tasks.length - 1; index >= 0; index -= 1) {
        if (tasks[index]?.kind !== "method") {
          replaceIndex = index;
          break;
        }
      }
      if (replaceIndex >= 0) tasks[replaceIndex] = counterFallback;
    }
  }
  const rawLayout = Array.isArray(value.answerLayout) ? value.answerLayout.filter(isRecord) : [];
  const answerLayout = rawLayout.map((item, index): ResearchPlanLayout | null => {
    const title = text(item.title);
    if (!title) return null;
    return {
      id: safeId(text(item.id) || `block-${index + 1}`),
      title: title.slice(0, 50),
      kind: answerKind(item.kind),
      question: text(item.question).slice(0, 220) || title,
    };
  }).filter((item): item is ResearchPlanLayout => item !== null).slice(0, 8);

  return {
    objective: text(value.objective).slice(0, 220) || fallback.objective,
    targetLabel: input.facts.subject?.label || text(value.targetLabel) || fallback.targetLabel,
    rationale: text(value.rationale).slice(0, 360) || fallback.rationale,
    tasks,
    answerLayout: answerLayout.length ? answerLayout : fallback.answerLayout,
    synthesisCriteria: stringList(value.synthesisCriteria, 8).length
      ? stringList(value.synthesisCriteria, 8)
      : fallback.synthesisCriteria,
  };
}

export function researchPlanOutputSchema() {
  return {
    objective: "本轮研究要回答的核心问题",
    targetLabel: "研究对象",
    rationale: "为何采用这些研究任务",
    tasks: [{
      id: "稳定英文或拼音id",
      name: "本轮动态角色名称",
      mission: "明确的单一研究任务",
      reason: "该任务与用户问题的关系",
      kind: "domain|method|verification|counter",
      skillId: "仅方法任务填写",
      evidenceKeywords: ["用于路由证据的关键词"],
      expectedOutput: "该角色应返回什么",
    }],
    answerLayout: [{
      id: "稳定id",
      title: "由问题决定的结果块标题",
      kind: "analysis|method|comparison|scenario|risk|evidence|checklist",
      question: "这个结果块具体回答什么",
    }],
    synthesisCriteria: ["主审合并时必须遵守的标准"],
  };
}

function skillTask(skill: ResearchSkill): ResearchPlanTask {
  return {
    id: `skill:${skill.id}`,
    name: `${skill.name}方法 Agent`,
    mission: `${skill.description}。严格执行：${skill.instructions}`,
    reason: "用户显式选择了该金融分析方法。",
    kind: "method",
    skillId: skill.id,
    evidenceKeywords: [...skill.requiredData, ...skill.aliases, skill.name].slice(0, 12),
    expectedOutput: "条件是否满足、支持与反对证据、方法结论及失效条件",
  };
}

function taskLimit(input: PlanInput) {
  // Quick mode uses one coordinated model call, not one research method. Every
  // explicitly selected method still participates as a virtual specialist role.
  if (input.depth === "quick") {
    const baseline = inferMarketResearchTarget(input.question) ? 2 : 1;
    return Math.max(baseline, input.skills.length + (input.skills.length ? 1 : 0));
  }
  return input.depth === "deep" ? 7 : 5;
}

function selectCoreTasks(question: string, depth: ResearchDepth) {
  if (isGeneralFinancialKnowledgeQuestion(question)) return [GENERAL_KNOWLEDGE_TASK];
  const normalized = question.toLocaleLowerCase();
  const taskPool = inferMarketResearchTarget(question) ? MARKET_TASKS : CORE_TASKS;
  const scored = taskPool.map((task, index) => ({
    task,
    index,
    score: task.evidenceKeywords.reduce((sum, keyword) => sum + (normalized.includes(keyword.toLocaleLowerCase()) ? 2 : 0), 0)
      + (task.kind === "counter" && depth !== "quick" ? 1 : 0),
  })).sort((left, right) => right.score - left.score || left.index - right.index);
  const count = depth === "quick" ? (inferMarketResearchTarget(question) ? 2 : 1) : depth === "deep" ? 4 : 3;
  return scored.slice(0, count).map((item) => item.task);
}

function buildAnswerLayout(question: string, tasks: ResearchPlanTask[], skills: ResearchSkill[]): ResearchPlanLayout[] {
  const normalized = question.toLocaleLowerCase();
  const layout: ResearchPlanLayout[] = [];
  if (skills.length) {
    layout.push({ id: "selected-methods", title: "所选方法联合判断", kind: "method", question: "各方法的条件、分歧和共同结论是什么？" });
  }
  if (isGeneralFinancialKnowledgeQuestion(question)) {
    layout.push({ id: "direct-answer", title: "直接回答", kind: "analysis", question });
    return dedupeLayouts(layout);
  }
  if (inferMarketResearchTarget(question)) {
    tasks.forEach((task) => {
      if (task.id === "market-index-trend") layout.push({ id: "market-state", title: "指数状态与趋势证据", kind: "analysis", question: "当前主要指数处于什么状态，趋势由哪些真实数据支持？" });
      if (task.id === "market-breadth-rotation") layout.push({ id: "market-breadth", title: "市场广度与轮动线索", kind: "comparison", question: "领涨领跌结构反映了怎样的市场广度和风格？" });
      if (task.id === "market-catalyst-news") layout.push({ id: "market-drivers", title: "正在定价的驱动因素", kind: "evidence", question: "哪些资金、政策和事件正在影响市场，证据时效如何？" });
      if (task.id === "market-counter-scenario") layout.push({ id: "market-scenarios", title: "后续情景与失效条件", kind: "scenario", question: "偏强、震荡和转弱情景分别需要哪些条件确认？" });
    });
    if (/明日|下周|未来|后市|走势|趋势|怎么看|判断/.test(normalized)
      && !layout.some((block) => block.id === "market-scenarios")) {
      layout.push({ id: "market-scenarios", title: "后续情景与失效条件", kind: "scenario", question: "未来走势的核心情景及其确认、失效条件是什么？" });
    }
    if (/观察|跟踪|核验|清单|交易计划/.test(normalized)) {
      layout.push({ id: "next-checks", title: "下一窗口观察清单", kind: "checklist", question: "下一交易窗口最值得跟踪哪些可验证信号？" });
    }
    return dedupeLayouts(layout).slice(0, 7);
  }
  if (/对比|比较|区别|谁更/.test(normalized)) {
    layout.push({ id: "comparison", title: "关键对比", kind: "comparison", question: "比较对象在哪些维度存在实质差异？" });
  } else if (/情景|如果|假设|敏感/.test(normalized)) {
    layout.push({ id: "scenarios", title: "情景与敏感性", kind: "scenario", question: "不同假设如何改变结论？" });
  } else {
    layout.push({ id: "core-answer", title: "核心问题研判", kind: "analysis", question });
  }
  tasks.forEach((task) => {
    if (task.id === "business-quality") layout.push({ id: "business-quality", title: "经营质量与关键变量", kind: "analysis", question: "哪些经营事实直接影响本次问题的结论？" });
    if (task.id === "industry-catalyst") layout.push({ id: "industry-catalyst", title: "产业位置与催化兑现", kind: "evidence", question: "产业结构、竞争与事件如何传导到公司？" });
    if (task.id === "market-valuation") layout.push({ id: "market-window", title: "市场定价与观察窗口", kind: "comparison", question: "价格、估值和资金反映了什么预期？" });
    if (task.id === "counter-evidence") layout.push({ id: "counter-case", title: "最强反证与失效边界", kind: "risk", question: "什么证据会推翻当前判断？" });
  });
  if (/下一步|观察|跟踪|核验|清单|怎么办|买|卖|持仓/.test(normalized)) {
    layout.push({ id: "next-checks", title: "下一步核验", kind: "checklist", question: "最值得继续查证的事项是什么？" });
  }
  return dedupeLayouts(layout).slice(0, 7);
}

export function isGeneralFinancialKnowledgeQuestion(question: string) {
  const normalized = question.trim().toLocaleLowerCase();
  if (!normalized) return false;
  const asksForKnowledge = /什么是|是什么意思|如何理解|怎么理解|如何计算|怎么算|计算公式|定义|概念|原理|解释一下|科普|有何区别|有什么区别|区别是什么|为何会|为什么会/.test(normalized);
  const asksForSpecificResearch = /\b(?:sh|sz|bj)?\d{6}\b|股价|走势|估值|财报|公告|研报|持仓|买入|卖出|目标价|大盘|指数|板块|行业|公司/.test(normalized);
  return asksForKnowledge && !asksForSpecificResearch;
}

function dedupeLayouts(layouts: ResearchPlanLayout[]) {
  const seen = new Set<string>();
  return layouts.filter((layout) => {
    if (seen.has(layout.id)) return false;
    seen.add(layout.id);
    return true;
  });
}

function dedupeTasks(tasks: ResearchPlanTask[]) {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    const key = task.skillId ? `skill:${task.skillId}` : task.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function answerKind(value: unknown): ResearchPlanLayout["kind"] {
  return value === "method" || value === "comparison" || value === "scenario" || value === "risk" || value === "evidence" || value === "checklist"
    ? value
    : "analysis";
}

function safeId(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9:_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "task";
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, limit);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

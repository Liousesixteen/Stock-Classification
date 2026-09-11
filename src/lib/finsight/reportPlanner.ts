import type { ResearchReportType } from "@/lib/repositories/researchDocuments";

export type FinSightTargetType = "financial_company" | "financial_industry" | "financial_macro" | "general";

export type FinSightReportPlan = {
  reportType: ResearchReportType;
  targetType: FinSightTargetType;
  label: string;
  description: string;
  rationale: string;
  outline: string[];
};

export const REPORT_MODE_DEFINITIONS: Record<ResearchReportType, Omit<FinSightReportPlan, "reportType" | "rationale">> = {
  company: {
    targetType: "financial_company",
    label: "公司深度",
    description: "业务、财务、估值与风险",
    outline: ["投资摘要", "公司概览", "主营业务与收入构成", "产业链位置", "竞争优势", "财务与估值", "催化因素", "风险与反证", "结论与待验证事项"],
  },
  industry: {
    targetType: "financial_industry",
    label: "行业研究",
    description: "供需、格局、产业链与公司映射",
    outline: ["研究摘要", "赛道定义与边界", "产业链结构", "供需与景气", "竞争格局与公司映射", "催化因素", "风险与反证", "跟踪指标与结论"],
  },
  macro: {
    targetType: "financial_macro",
    label: "宏观研究",
    description: "政策、周期、流动性与资产影响",
    outline: ["宏观摘要", "问题定义与口径", "核心指标与周期位置", "政策与流动性", "传导机制", "资产与行业影响", "情景推演", "风险与反证", "跟踪框架与结论"],
  },
  comparison: {
    targetType: "general",
    label: "公司对比",
    description: "同口径经营、财务与估值比较",
    outline: ["对比摘要", "公司与业务口径", "产业链位置对比", "经营与财务对比", "竞争优势对比", "催化因素对比", "风险与反证", "结论与待验证事项"],
  },
  event: {
    targetType: "general",
    label: "事件影响",
    description: "事实核验、传导路径与情景分析",
    outline: ["事件摘要", "事实与证据", "影响传导路径", "公司与产业链影响", "情景分析", "后续跟踪节点", "风险与反证", "结论"],
  },
  general: {
    targetType: "general",
    label: "开放研究",
    description: "围绕问题动态规划采集与分析任务",
    outline: ["研究摘要", "问题与研究边界", "背景与关键概念", "证据与方法", "核心发现", "机制与影响", "情景与争议", "风险与反证", "结论与后续研究"],
  },
};

export const REPORT_MODES = (Object.entries(REPORT_MODE_DEFINITIONS) as Array<[
  ResearchReportType,
  (typeof REPORT_MODE_DEFINITIONS)[ResearchReportType],
]>).map(([value, definition]) => ({ value, ...definition }));

export function inferFinSightReportPlan(input: {
  question: string;
  targetType?: "company" | "industry" | "question" | null;
  stockCode?: string;
  comparisonCodes?: string[];
  preferredType?: ResearchReportType | null;
}): FinSightReportPlan {
  const question = input.question.trim();
  const comparisonCount = new Set([input.stockCode, ...(input.comparisonCodes ?? [])].filter(Boolean)).size;
  let reportType: ResearchReportType;
  let rationale: string;

  if (input.preferredType) {
    reportType = input.preferredType;
    rationale = "按用户选择的研究方式执行";
  } else if (comparisonCount >= 2 || /(?:对比|比较|横向|孰优|谁更|\bvs\.?\b|区别)/i.test(question)) {
    reportType = "comparison";
    rationale = "问题包含多标的或明确的比较关系";
  } else if (/(?:宏观|GDP|CPI|PPI|PMI|社融|M\d|利率|降息|加息|汇率|通胀|通缩|流动性|货币政策|财政政策|经济周期)/i.test(question)) {
    reportType = "macro";
    rationale = "问题聚焦宏观指标、政策或经济周期";
  } else if (/(?:事件|影响|公告|财报|业绩预告|政策出台|制裁|事故|并购|重组|减持|增持|涨价|降价|订单|发布会|突发|传闻|延期)/i.test(question)) {
    reportType = "event";
    rationale = "问题要求解释事件事实及其影响路径";
  } else if (input.targetType === "industry" || /(?:行业|赛道|板块|产业规模|市场规模|供需格局|竞争格局|渗透率|景气度)/i.test(question)) {
    reportType = "industry";
    rationale = "问题面向行业边界、供需或竞争格局";
  } else if (input.targetType === "company" || /(?:公司|企业|主营|财务|估值|ROE|毛利率|现金流|股票|个股)/i.test(question)) {
    reportType = "company";
    rationale = "问题面向单一公司及其经营或估值";
  } else {
    reportType = "general";
    rationale = question ? "未限定固定金融模板，将由多智能体引擎动态规划" : "输入问题后自动识别研究方式";
  }

  const definition = REPORT_MODE_DEFINITIONS[reportType];
  return { reportType, rationale, ...definition };
}

export function reportOutlineForType(reportType: ResearchReportType) {
  return REPORT_MODE_DEFINITIONS[reportType].outline;
}

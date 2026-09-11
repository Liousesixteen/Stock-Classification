import type { CompanyResearchFacts, ResearchExecution } from "./deepseekResearchAgent";

export type DAStockResearchTool = {
  id: string;
  name: string;
  description: string;
  category: "行情" | "技术" | "基本面" | "情报" | "市场" | "组合" | "回测";
  fieldKeys: string[];
};

// Function-for-function port of the user-facing tool catalogue in
// DA-Stock/src/agent/tools and api/v1/endpoints/agent.py. Tools that do not
// yet have a trustworthy local Provider remain visible as unavailable instead
// of being silently simulated by the model.
export const DA_STOCK_RESEARCH_TOOLS: DAStockResearchTool[] = [
  { id: "get_realtime_quote", name: "获取实时行情", description: "价格、涨跌幅、换手率、估值和市值快照", category: "行情", fieldKeys: ["realtimeQuote", "price", "changePercent", "turnoverPercent"] },
  { id: "get_daily_history", name: "获取历史K线", description: "前复权日线、成交量和区间高低点", category: "行情", fieldKeys: ["technicalSnapshot"] },
  { id: "get_chip_distribution", name: "分析筹码分布", description: "筹码集中度、平均成本和获利比例", category: "技术", fieldKeys: ["chipDistribution"] },
  { id: "get_analysis_context", name: "获取分析上下文", description: "公司档案、产业关系、证据和历史研究上下文", category: "基本面", fieldKeys: [] },
  { id: "get_stock_info", name: "获取股票基本面", description: "主营、财务、估值、行业和公司资料", category: "基本面", fieldKeys: ["intro", "businessComposition", "incomeStatements"] },
  { id: "search_stock_news", name: "搜索股票新闻", description: "公司公告、事件与近期公开信息", category: "情报", fieldKeys: ["announcements", "newsSearchResult"] },
  { id: "search_comprehensive_intel", name: "搜索综合情报", description: "公告、研报、行业与公司情报交叉检索", category: "情报", fieldKeys: ["announcements", "researchReports", "newsSearchResult", "marketNews", "marketNewsDirect"] },
  { id: "analyze_trend", name: "分析技术趋势", description: "均线排列、MACD、RSI、支撑阻力与趋势强度", category: "技术", fieldKeys: ["technicalSnapshot"] },
  { id: "calculate_ma", name: "计算均线系统", description: "MA5、MA10、MA20、MA60 与乖离率", category: "技术", fieldKeys: ["technicalSnapshot"] },
  { id: "get_volume_analysis", name: "分析量能变化", description: "成交量、量比和量价配合", category: "技术", fieldKeys: ["technicalSnapshot"] },
  { id: "analyze_pattern", name: "识别K线形态", description: "近期K线组合、突破和反转形态", category: "技术", fieldKeys: ["technicalSnapshot"] },
  { id: "get_market_indices", name: "获取市场指数", description: "A股主要指数环境", category: "市场", fieldKeys: ["marketIndices"] },
  { id: "get_market_breadth", name: "获取市场宽度", description: "全市场涨跌家数、中位数涨幅与成交额", category: "市场", fieldKeys: ["marketBreadth"] },
  { id: "get_market_index_history", name: "获取指数历史日线", description: "主要指数日线、均线、MACD、RSI、量能与区间位置", category: "市场", fieldKeys: ["marketTechnicalSnapshots"] },
  { id: "get_sector_rankings", name: "分析行业板块", description: "行业板块强弱与相对排名", category: "市场", fieldKeys: ["sectorRankings"] },
  { id: "get_capital_flow", name: "分析资金流向", description: "主力、超大单和阶段资金流向", category: "行情", fieldKeys: ["capitalFlow"] },
  { id: "get_portfolio_snapshot", name: "获取组合快照", description: "持仓、集中度和组合风险上下文", category: "组合", fieldKeys: ["portfolioSnapshot"] },
  { id: "get_skill_backtest_summary", name: "获取策略回测概览", description: "所选策略的历史样本、胜率和收益概览", category: "回测", fieldKeys: ["skillBacktest"] },
  { id: "get_strategy_backtest_summary", name: "获取策略回测概览", description: "兼容历史策略回测接口", category: "回测", fieldKeys: ["skillBacktest"] },
  { id: "get_stock_backtest_summary", name: "获取个股回测数据", description: "个股历史策略命中和表现记录", category: "回测", fieldKeys: ["stockBacktest"] },
];

export function buildDAStockToolTrace(
  facts: CompanyResearchFacts,
  options: { includeTechnical: boolean; includeUnavailable?: boolean },
): NonNullable<ResearchExecution["toolTrace"]> {
  const availableFields = new Set(
    facts.fieldFacts
      .filter((fact) => fact.status === "available")
      .map((fact) => String(fact.fieldKey ?? "")),
  );

  const trace = DA_STOCK_RESEARCH_TOOLS
    .filter((tool) => options.includeTechnical || tool.category !== "技术")
    .map((tool) => {
      const isContextTool = tool.id === "get_analysis_context";
      const matched = tool.fieldKeys.filter((fieldKey) =>
        availableFields.has(fieldKey) || [...availableFields].some((available) => available.startsWith(`${fieldKey}:`)),
      );
      const available = isContextTool
        ? facts.subject?.kind === "company" || facts.relations.length > 0 || facts.evidence.length > 0
        : matched.length > 0;
      return {
        tool: tool.id,
        status: available ? "completed" as const : "unavailable" as const,
        detail: available
          ? `${tool.name}已接入统一 Provider${matched.length ? `（${matched.join("、")}）` : "（公司档案与证据）"}`
          : `${tool.name}当前无可信 Provider 数据，本轮不会由 AI 补写`,
      };
    });
  return options.includeUnavailable === false
    ? trace.filter((item) => item.status === "completed")
    : trace;
}

export function getDAStockToolName(toolId: string) {
  return DA_STOCK_RESEARCH_TOOLS.find((tool) => tool.id === toolId)?.name ?? toolId;
}

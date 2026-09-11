import { describe, expect, it } from "vitest";
import {
  buildDAStockToolTrace,
  DA_STOCK_RESEARCH_TOOLS,
  getDAStockToolName,
} from "@/lib/agents/daStockResearchTools";
import type { CompanyResearchFacts } from "@/lib/agents/deepseekResearchAgent";

const facts: CompanyResearchFacts = {
  subject: { kind: "company", label: "通富微电", key: "002156" },
  company: { stockCode: "002156", shortName: "通富微电" },
  relations: [],
  evidence: [],
  researchProfile: null,
  fieldFacts: [{
    fieldKey: "technicalSnapshot",
    value: { close: 20 },
    status: "available",
    provider: "Eastmoney Kline",
    sourceUrl: "https://example.com/kline",
    confidence: "high",
    verificationStatus: "unverified",
    fetchedAt: "2026-08-02T00:00:00.000Z",
  }],
  dossierQuality: { overallScore: 20, reliabilityLabel: "待核验" },
  evidenceTimeline: [],
  graphRelations: [],
  notes: [],
};

describe("research tool catalogue", () => {
  it("keeps the complete public tool catalogue", () => {
    expect(DA_STOCK_RESEARCH_TOOLS.map((tool) => tool.id)).toEqual(expect.arrayContaining([
      "get_realtime_quote",
      "get_daily_history",
      "get_chip_distribution",
      "get_analysis_context",
      "get_stock_info",
      "search_stock_news",
      "search_comprehensive_intel",
      "analyze_trend",
      "calculate_ma",
      "get_volume_analysis",
      "analyze_pattern",
      "get_market_indices",
      "get_market_breadth",
      "get_market_index_history",
      "get_sector_rankings",
      "get_capital_flow",
      "get_portfolio_snapshot",
      "get_skill_backtest_summary",
      "get_strategy_backtest_summary",
      "get_stock_backtest_summary",
    ]));
    expect(DA_STOCK_RESEARCH_TOOLS).toHaveLength(20);
  });

  it("marks only Provider-backed tools completed and never simulates unavailable data", () => {
    const trace = buildDAStockToolTrace(facts, { includeTechnical: true });
    expect(trace.find((item) => item.tool === "analyze_trend")?.status).toBe("completed");
    expect(trace.find((item) => item.tool === "get_portfolio_snapshot")).toMatchObject({
      status: "unavailable",
      detail: expect.stringContaining("不会由 AI 补写"),
    });
    expect(getDAStockToolName("calculate_ma")).toBe("计算均线系统");
  });

  it("can expose only tools actually backed by this research context", () => {
    const trace = buildDAStockToolTrace(facts, { includeTechnical: true, includeUnavailable: false });
    expect(trace.length).toBeGreaterThan(0);
    expect(trace.every((item) => item.status === "completed")).toBe(true);
    expect(trace.some((item) => item.tool === "get_portfolio_snapshot")).toBe(false);
  });
});

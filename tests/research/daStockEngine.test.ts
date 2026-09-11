import { describe, expect, it } from "vitest";
import { localizeCatalogTool, mapEngineProgress, publicEngineError } from "@/lib/research/daStockEngine";

describe("DA-Stock engine protocol", () => {
  it("preserves real tool duration and localizes the original tool event", () => {
    expect(mapEngineProgress({
      type: "tool_done",
      tool: "get_market_indices",
      success: true,
      duration: 1.52,
    })).toMatchObject({
      type: "tool_done",
      tool: "get_market_indices",
      displayName: "主要市场指数",
      message: "主要市场指数已返回结果",
      durationMs: 1520,
      success: true,
    });
  });

  it("maps original multi-agent stage events without inventing progress", () => {
    expect(mapEngineProgress({ type: "stage_start", stage: "risk" })).toMatchObject({
      type: "agent_start",
      stageId: "risk",
      displayName: "风险审查 Agent",
      message: "正在启动风险审查 Agent",
    });
  });

  it("presents the original tool catalog in user-facing Chinese", () => {
    expect(localizeCatalogTool({
      id: "search_comprehensive_intel",
      name: "search_comprehensive_intel",
      description: "upstream description",
    })).toMatchObject({
      id: "search_comprehensive_intel",
      name: "综合情报检索",
      description: "并行检索新闻、市场观点、风险、业绩预期和行业趋势。",
    });
  });

  it("exposes safe actionable provider failures", () => {
    expect(publicEngineError({ type: "done", error: "OpenAIException - Insufficient Balance" }))
      .toBe("当前模型账户余额不足，已尝试全部配置的回退模型");
    expect(publicEngineError({ type: "error", error_class: "RuntimeError" }))
      .toBe("问股引擎未完成（RuntimeError）");
  });
});

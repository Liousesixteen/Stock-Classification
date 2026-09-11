import { describe, expect, it } from "vitest";
import { inferMarketResearchTarget, inferStandaloneStockQuery } from "@/lib/research/researchTarget";

describe("research target inference", () => {
  it("recognizes standalone company names and A-share codes", () => {
    expect(inferStandaloneStockQuery("长电科技")).toBe("长电科技");
    expect(inferStandaloneStockQuery("请研究长电科技")).toBe("长电科技");
    expect(inferStandaloneStockQuery("分析一下长电科技")).toBe("长电科技");
    expect(inferStandaloneStockQuery("长电科技怎么样？")).toBe("长电科技");
    expect(inferStandaloneStockQuery("分析 600584")).toBe("600584");
  });

  it("does not treat a normal research question as a target switch", () => {
    expect(inferStandaloneStockQuery("长电科技的核心风险是什么？")).toBe("");
    expect(inferStandaloneStockQuery("如何判断行业景气度拐点？")).toBe("");
  });

  it("separates a company name from a directed research topic", () => {
    expect(inferStandaloneStockQuery("分析比亚迪趋势")).toBe("比亚迪");
    expect(inferStandaloneStockQuery("研究宁德时代的估值")).toBe("宁德时代");
  });

  it("routes broad-market questions to the A-share market instead of a remembered company", () => {
    for (const question of [
      "分析一下大盘走势",
      "未来一周A股市场怎么看？",
      "上证指数和创业板指今天为什么分化？",
      "复盘今天的板块轮动",
    ]) {
      expect(inferMarketResearchTarget(question)).toEqual({
        market: "cn",
        key: "market-cn",
        label: "A股大盘",
      });
      expect(inferStandaloneStockQuery(question)).toBe("");
    }
  });

  it("keeps market-impact questions attached to the named company", () => {
    expect(inferMarketResearchTarget("大盘走势对雷赛智能有什么影响？")).toBeNull();
    expect(inferMarketResearchTarget("长电科技受大盘下跌影响有多大？")).toBeNull();
  });
});

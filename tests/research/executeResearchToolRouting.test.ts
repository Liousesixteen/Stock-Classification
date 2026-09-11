import { describe, expect, it } from "vitest";
import { shouldLoadCompanyTechnicalData } from "@/lib/research/executeResearch";

describe("AI 研判工具路由", () => {
  it("按自然语言问题调用技术数据，不要求用户先选策略", () => {
    expect(shouldLoadCompanyTechnicalData("分析长电科技当前基本面、股价趋势和主要风险")).toBe(true);
    expect(shouldLoadCompanyTechnicalData("茅台最近有没有放量突破？")).toBe(true);
    expect(shouldLoadCompanyTechnicalData("介绍一下长电科技的主营业务")).toBe(false);
  });

  it("显式研究方法仍会加载方法所需行情", () => {
    expect(shouldLoadCompanyTechnicalData("分析长电科技", ["chan_theory"])).toBe(true);
  });
});

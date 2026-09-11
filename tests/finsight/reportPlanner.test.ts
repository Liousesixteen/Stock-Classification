import { describe, expect, it } from "vitest";
import { inferFinSightReportPlan, reportOutlineForType } from "@/lib/finsight/reportPlanner";

describe("FinSight question-driven report planner", () => {
  it.each([
    ["分析贵州茅台主营业务、现金流和估值", "company", "financial_company"],
    ["研究人形机器人行业的供需格局与渗透率", "industry", "financial_industry"],
    ["降息周期会如何影响人民币汇率和 A 股？", "macro", "financial_macro"],
    ["比较招商银行与宁波银行的盈利质量", "comparison", "general"],
    ["某公司发布并购公告会产生什么影响？", "event", "general"],
    ["技术扩散如何改变组织决策方式？", "general", "general"],
  ] as const)("routes %s to %s", (question, reportType, targetType) => {
    const plan = inferFinSightReportPlan({ question });
    expect(plan.reportType).toBe(reportType);
    expect(plan.targetType).toBe(targetType);
    expect(plan.outline).toEqual(reportOutlineForType(reportType));
  });

  it("recognizes comparison from multiple stock codes", () => {
    expect(inferFinSightReportPlan({
      question: "分析两家公司的差异",
      stockCode: "600036",
      comparisonCodes: ["002142"],
    }).reportType).toBe("comparison");
  });
});

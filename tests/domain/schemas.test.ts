import { describe, expect, it } from "vitest";
import { companyResearchProfileInputSchema, manualStockRelationInputSchema, relationInputSchema } from "@/lib/domain/schemas";
import { safeExternalUrl } from "@/lib/security/urls";

describe("domain schemas", () => {
  it("accepts a valid company-category relation", () => {
    const result = relationInputSchema.parse({
      stockCode: "300346",
      categoryId: 12,
      relationType: "主营业务",
      confidence: "高",
      rationale: "ArF 光刻胶产业化进展明确",
      isWatchlist: false,
    });

    expect(result.stockCode).toBe("300346");
    expect(result.relationType).toBe("主营业务");
  });

  it("rejects an unsupported relation type", () => {
    expect(() =>
      relationInputSchema.parse({
        stockCode: "300346",
        categoryId: 12,
        relationType: "随便写",
        confidence: "高",
        rationale: "bad",
        isWatchlist: false,
      }),
    ).toThrow();
  });

  it("accepts evidence bundled with a manually added relation", () => {
    const result = manualStockRelationInputSchema.parse({
      stockCode: "300346",
      categoryId: 12,
      shortName: "南大光电",
      relationType: "主营业务",
      confidence: "高",
      rationale: "自动同步资料显示与光刻胶方向相关",
      evidence: {
        sourceType: "网页",
        title: "自动同步资料：南大光电",
        excerpt: "百度概念板块：光刻胶、半导体材料。",
      },
    });

    expect(result.evidence).toMatchObject({
      sourceType: "网页",
      title: "自动同步资料：南大光电",
      isExpired: false,
    });
    expect(result.evidence).not.toHaveProperty("credibility");
  });

  it("accepts structured company research profile input", () => {
    const result = companyResearchProfileInputSchema.parse({
      summary: "封测龙头。",
      businessLines: [{ name: "芯片封装", share: "占比待补", grossMargin: "毛利率待补" }],
      chainPosition: ["封测环节"],
      competitiveAdvantages: ["全球化产能"],
      keyCustomers: ["客户待补"],
      catalysts: ["先进封装需求提升"],
      risks: ["行业周期波动"],
      sourceSummary: "自动同步资料",
    });

    expect(result.businessLines[0].share).toBe("占比待补");
  });

  it("rejects executable source URLs and only renders http links", () => {
    const result = manualStockRelationInputSchema.safeParse({
      stockCode: "300346",
      categoryId: 12,
      shortName: "南大光电",
      relationType: "主营业务",
      confidence: "高",
      rationale: "测试来源链接边界",
      evidence: {
        sourceType: "网页",
        title: "恶意链接",
        url: "javascript:alert(1)",
      },
    });
    expect(result.success).toBe(false);
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("https://example.com/source")).toBe("https://example.com/source");
  });
});

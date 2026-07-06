import { describe, expect, it } from "vitest";
import { organizeStockFacts } from "@/lib/agents/classificationAgent";
import type { StockLookupProfile } from "@/lib/datasources/stockLookup";
import type { CategoryNode } from "@/lib/domain/types";

const baseProfile: StockLookupProfile = {
  stockCode: "600030",
  shortName: "中信证券",
  board: "沪市主板",
  industry: "证券Ⅱ",
  region: "",
  marketCapBand: ">1000亿",
  intro: "东财基础资料显示，中信证券属于证券Ⅱ行业，上市板块为沪市主板。",
  mainBusiness: "证券Ⅱ",
  source: "eastmoney",
  sourceDetail: "东方财富 push2 基础资料",
};

function category(overrides: Partial<CategoryNode>): CategoryNode {
  return {
    id: 1,
    name: "证券",
    parentId: null,
    level: 0,
    sortOrder: 0,
    aliases: ["券商"],
    description: "覆盖综合券商、财富管理、投行业务和资本市场服务。",
    industry: "非银金融",
    isActive: true,
    children: [],
    ...overrides,
  };
}

describe("classificationAgent", () => {
  it("organizes directly matched facts into a high-confidence main-business relation", () => {
    const result = organizeStockFacts({
      profile: baseProfile,
      category: category({ name: "证券" }),
    });

    expect(result).toMatchObject({
      relationType: "主营业务",
      confidence: "高",
      agentName: "rules-classification-agent",
    });
    expect(result.rationale).toContain("中信证券");
    expect(result.rationale).toContain("证券");
    expect(result.sourceFacts).toContain("行业：证券Ⅱ");
  });

  it("uses category signal terms to classify broader theme matches", () => {
    const result = organizeStockFacts({
      profile: {
        ...baseProfile,
        stockCode: "688235",
        shortName: "百济神州",
        board: "科创板",
        industry: "化学制药",
        intro: "东财基础资料显示，百济神州属于化学制药行业，上市板块为科创板。",
        mainBusiness: "化学制药",
      },
      category: category({
        name: "创新药",
        aliases: ["创新药概念"],
        description: "覆盖 A 股创新药研发、商业化、ADC/生物药及相关医药服务标的。",
        industry: "医药生物",
      }),
    });

    expect(result.relationType).toBe("重要相关");
    expect(result.confidence).toBe("中");
    expect(result.rationale).toContain("化学制药");
    expect(result.rationale).toContain("后续需要补充公告、年报或研报证据");
  });

  it("falls back to watchlist-style verification when facts are weak", () => {
    const result = organizeStockFacts({
      profile: {
        ...baseProfile,
        shortName: "测试公司",
        industry: "食品饮料",
        intro: "东财基础资料显示，测试公司属于食品饮料行业。",
        mainBusiness: "食品饮料",
      },
      category: category({ name: "商业航天", aliases: ["卫星互联网"], industry: "国防军工" }),
    });

    expect(result.relationType).toBe("待验证");
    expect(result.confidence).toBe("低");
    expect(result.rationale).toContain("暂未从当前基础资料中识别到");
  });
});

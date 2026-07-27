import { describe, expect, it } from "vitest";
import { buildCompanyResearchDetail } from "@/lib/research/detailView";

describe("company research detail view", () => {
  it("builds a right-panel research card model from existing company data", () => {
    const detail = buildCompanyResearchDetail({
      company: {
        stockCode: "600584",
        shortName: "长电科技",
        fullName: "江苏长电科技股份有限公司",
        board: "沪市主板",
        industry: "半导体",
        region: "江苏",
        marketCapBand: "300-1000亿",
        intro: "长电科技是全球化封测服务商，具备先进封装技术和客户覆盖优势。",
        mainBusiness: "封装业务收入占比70%；测试业务收入占比30%。",
        updatedAt: "2026-07-07 10:00:00",
      },
      relations: [
        {
          id: 1,
          categoryId: 8,
          categoryName: "封测",
          relationType: "主营业务",
          confidence: "高",
          rationale: "公司主营构成直接为芯片封装和测试服务，属于封测环节核心业务。",
          isWatchlist: false,
        },
      ],
      evidenceByRelationId: {
        "1": [
          {
            id: 1,
            sourceType: "年报",
            title: "自动同步资料：长电科技",
            sourceDate: "2025-04-20",
            url: "",
            excerpt: "公司披露封装业务收入占比70%。",
            credibility: "高",
          },
        ],
      },
      researchProfile: {
        stockCode: "600584",
        summary: "全球化封测服务商，核心业务为芯片封装和测试。",
        businessLines: [
          { name: "封装业务", share: "70%", grossMargin: "毛利率待补" },
          { name: "测试业务", share: "30%", grossMargin: "毛利率待补" },
        ],
        chainPosition: ["封测环节", "面向芯片设计和制造客户提供后道服务"],
        competitiveAdvantages: ["先进封装技术", "全球客户覆盖"],
        keyCustomers: ["客户待补"],
        catalysts: ["先进封装需求提升"],
        risks: ["行业周期波动"],
        sourceSummary: "自动同步资料：长电科技",
        createdAt: "2026-07-07 10:00:00",
        updatedAt: "2026-07-07 10:00:00",
      },
      notes: [{ id: 1, noteType: "我的备注", content: "重点跟踪先进封装弹性。" }],
    });

    expect(detail.oneLiner).toContain("全球化封测服务商");
    expect(detail.atAGlance).toMatchObject({
      business: "封装业务、测试业务",
      chain: "封测",
      relation: "主营业务 · 高",
      status: "重点跟踪",
    });
    expect(detail.relation).toMatchObject({
      type: "已公开披露",
      confidence: "高",
      reason: expect.stringContaining("芯片封装和测试"),
    });
    expect(detail.scores).toMatchObject({
      relevance: 5,
      performance: 4,
      growth: 4,
      risk: 3,
    });
    expect(detail.businessSegments[0]).toMatchObject({
      name: "封装业务",
      exposure: "高",
      revenueRatio: 70,
    });
    expect(detail.evidence).toHaveLength(1);
    expect(detail.note.content).toBe("重点跟踪先进封装弹性。");
    expect(detail.researchStatus).toBe("重点跟踪");
  });

  it("builds an instant glance from sparse quick-save data", () => {
    const detail = buildCompanyResearchDetail({
      company: {
        stockCode: "600000",
        shortName: "快存标的",
        fullName: "",
        board: "沪市主板",
        industry: "测试行业",
        region: "",
        marketCapBand: "",
        intro: "快存标的本地索引资料。",
        mainBusiness: "",
        updatedAt: "2026-07-08 10:00:00",
      },
      relations: [
        {
          id: 1,
          categoryId: 9,
          categoryName: "封测",
          relationType: "重要相关",
          confidence: "中",
          rationale: "纳入「封测」：快存标的，当前基础资料待后台补全。",
          isWatchlist: false,
        },
      ],
      evidenceByRelationId: {},
      researchProfile: null,
      notes: [],
    });

    expect(detail.atAGlance).toEqual({
      headline: "快存标的属于测试行业，当前归类于封测。",
      business: "测试行业相关业务",
      chain: "封测",
      relation: "重要相关 · 中",
      status: "观察",
    });
  });
});

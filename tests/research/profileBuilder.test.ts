import { describe, expect, it } from "vitest";
import { buildDisplayResearchProfile, buildResearchProfileDraft } from "@/lib/research/profileBuilder";

describe("research profile builder", () => {
  it("keeps explicit business shares when source text contains percentages", () => {
    const profile = buildResearchProfileDraft({
      stockCode: "600584",
      shortName: "长电科技",
      industry: "半导体",
      intro: "长电科技是全球化封测服务商，具备先进封装技术和客户覆盖优势。",
      mainBusiness: "封装业务收入占比70%；测试业务收入占比30%。",
      relations: [{ categoryName: "封测", relationType: "主营业务", confidence: "高", rationale: "封测主业明确" }],
      evidenceTitles: ["自动同步资料：长电科技"],
    });

    expect(profile.businessLines).toEqual([
      { name: "封装业务", share: "70%", grossMargin: "毛利率待补" },
      { name: "测试业务", share: "30%", grossMargin: "毛利率待补" },
    ]);
    expect(profile.competitiveAdvantages).toContain("长电科技是全球化封测服务商，具备先进封装技术和客户覆盖优势");
  });

  it("does not invent shares when source text has no percentage", () => {
    const profile = buildResearchProfileDraft({
      stockCode: "000021",
      shortName: "深科技",
      industry: "计算机设备",
      intro: "深科技主营存储半导体、高端制造和计量系统。",
      mainBusiness: "存储半导体、高端制造、计量系统。",
      relations: [{ categoryName: "封测", relationType: "重要相关", confidence: "中", rationale: "包含半导体相关制造业务" }],
      evidenceTitles: [],
    });

    expect(profile.businessLines).toEqual([
      { name: "存储半导体", share: "占比待补", grossMargin: "毛利率待补" },
      { name: "高端制造", share: "占比待补", grossMargin: "毛利率待补" },
      { name: "计量系统", share: "占比待补", grossMargin: "毛利率待补" },
    ]);
    expect(profile.chainPosition).toContain("当前细分：封测");
    expect(profile.sourceSummary).toBe("自动结构化：深科技");
  });

  it("prefers explicit main product sections over long business review text", () => {
    const profile = buildResearchProfileDraft({
      stockCode: "688106",
      shortName: "金宏气体",
      industry: "电子化学品",
      intro: "金宏气体是专业从事气体研发、生产、销售和服务的综合气体提供商。",
      mainBusiness:
        "经营评述：公司为电子半导体客户提供气体供应服务，覆盖研发、生产、销售等环节；主营构成：特种气体、电子大宗气体、天然气；东财行业：电子化学品。",
      relations: [{ categoryName: "电子特气", relationType: "主营业务", confidence: "高", rationale: "产品应用于电子半导体客户。" }],
      evidenceTitles: [],
    });

    expect(profile.businessLines).toEqual([
      { name: "特种气体", share: "占比待补", grossMargin: "毛利率待补" },
      { name: "电子大宗气体", share: "占比待补", grossMargin: "毛利率待补" },
      { name: "天然气", share: "占比待补", grossMargin: "毛利率待补" },
    ]);
  });

  it("builds a display profile when a company has no persisted research profile", () => {
    const profile = buildDisplayResearchProfile({
      company: {
        stockCode: "688106",
        shortName: "金宏气体",
        industry: "电子化学品",
        intro: "金宏气体是专业从事气体研发、生产、销售和服务的综合气体提供商，致力于为客户创造价值。",
        mainBusiness: "主营构成：特种气体、电子大宗气体、天然气；经营评述：为电子半导体客户提供气体供应服务。",
        updatedAt: "2026-07-07 10:00:00",
      },
      relations: [{ categoryName: "电子特气", relationType: "主营业务", confidence: "高", rationale: "公司产品应用于电子半导体客户。" }],
      evidenceTitles: ["自动同步资料：金宏气体"],
      existingProfile: null,
    });

    expect(profile.businessLines.map((line) => line.name)).toEqual(["特种气体", "电子大宗气体", "天然气"]);
    expect(profile.chainPosition).toContain("当前细分：电子特气");
    expect(profile.competitiveAdvantages[0]).toContain("综合气体提供商");
    expect(profile.keyCustomers).toEqual(["电子半导体客户"]);
    expect(profile.sourceSummary).toBe("自动同步资料：金宏气体");
  });

  it("fills missing display fields without overwriting existing research profile content", () => {
    const profile = buildDisplayResearchProfile({
      company: {
        stockCode: "600584",
        shortName: "长电科技",
        industry: "半导体",
        intro: "长电科技具备先进封装技术优势。",
        mainBusiness: "封装业务收入占比70%；测试业务收入占比30%。",
        updatedAt: "2026-07-07 10:00:00",
      },
      relations: [{ categoryName: "封测", relationType: "主营业务", confidence: "高", rationale: "主业明确。" }],
      evidenceTitles: ["自动同步资料：长电科技"],
      existingProfile: {
        stockCode: "600584",
        summary: "人工整理摘要。",
        businessLines: [{ name: "先进封装", share: "占比待补", grossMargin: "毛利率待补" }],
        chainPosition: [],
        competitiveAdvantages: [],
        keyCustomers: ["客户待补"],
        catalysts: [],
        risks: [],
        sourceSummary: "",
        createdAt: "2026-07-07 09:00:00",
        updatedAt: "2026-07-07 09:00:00",
      },
    });

    expect(profile.summary).toBe("人工整理摘要。");
    expect(profile.businessLines).toEqual([{ name: "先进封装", share: "占比待补", grossMargin: "毛利率待补" }]);
    expect(profile.chainPosition).toContain("当前细分：封测");
    expect(profile.competitiveAdvantages[0]).toContain("先进封装技术优势");
    expect(profile.sourceSummary).toBe("自动同步资料：长电科技");
  });
});

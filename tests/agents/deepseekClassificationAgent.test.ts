import { afterEach, describe, expect, it, vi } from "vitest";
import { organizeStockFactsWithDeepSeek } from "@/lib/agents/deepseekClassificationAgent";
import type { StockLookupProfile } from "@/lib/datasources/stockLookup";
import type { CategoryNode } from "@/lib/domain/types";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

const profile: StockLookupProfile = {
  stockCode: "688235",
  shortName: "百济神州",
  fullName: "百济神州有限公司",
  board: "科创板",
  industry: "化学制药",
  region: "",
  marketCapBand: ">1000亿",
  intro: "东财基础资料显示，百济神州属于化学制药行业，上市板块为科创板。",
  mainBusiness: "东财行业：化学制药；相关概念：创新药、ADC",
  businessScope: "药品研发、生产和商业化。",
  businessReview: "公司围绕创新药研发和商业化开展业务。",
  concepts: ["创新药", "ADC"],
  industryBlocks: ["化学制药"],
  mainProducts: ["抗肿瘤药物"],
  sourceFacts: ["代码：688235", "简称：百济神州", "百度概念板块：创新药、ADC"],
  source: "eastmoney",
  sourceDetail: "东方财富 push2 基础资料；百度股市通关联板块",
};

const category: Pick<CategoryNode, "name" | "aliases" | "description" | "industry"> = {
  name: "创新药",
  aliases: ["创新药概念"],
  description: "覆盖 A 股创新药研发、商业化、ADC/生物药及相关医药服务标的。",
  industry: "医药生物",
};

describe("deepseekClassificationAgent", () => {
  it("calls DeepSeek chat completions with structured JSON output", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(_input);
      const body = JSON.parse(String(init?.body));

      expect(url).toBe("https://api.deepseek.com/chat/completions");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(body.model).toBe("deepseek-v4-flash");
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(JSON.stringify(body.messages)).toContain("json");
      expect(JSON.stringify(body.messages)).toContain("百济神州");

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  relationType: "重要相关",
                  confidence: "中",
                  rationale: "DeepSeek 已整理：百济神州属于化学制药行业，与创新药方向重要相关。",
                  sourceFacts: ["代码：688235", "行业：化学制药"],
                  companyProfilePatch: {
                    intro: "百济神州属于化学制药行业，关联创新药、ADC 等概念。",
                    mainBusiness: "东财行业：化学制药；相关概念：创新药、ADC。",
                    region: "",
                  },
                  evidence: {
                    sourceType: "网页",
                    title: "自动同步资料：百济神州",
                    sourceDate: "",
                    url: "",
                    excerpt: "代码：688235；行业：化学制药；百度概念板块：创新药、ADC。",
                    credibility: "中",
                  },
                  researchProfilePatch: {
                    summary: "百济神州聚焦创新药研发和商业化。",
                    businessLines: [{ name: "抗肿瘤药物", share: "占比待补", grossMargin: "毛利率待补" }],
                    chainPosition: ["创新药研发与商业化"],
                    competitiveAdvantages: ["产品管线和商业化能力"],
                    keyCustomers: ["医院终端与患者群体"],
                    catalysts: ["核心产品放量"],
                    risks: ["研发失败和竞争加剧"],
                    sourceSummary: "DeepSeek 基于给定事实整理",
                  },
                }),
              },
            },
          ],
        }),
      );
    });

    await expect(
      organizeStockFactsWithDeepSeek(
        { profile, category },
        { apiKey: "test-key", model: "deepseek-v4-flash" },
        fetcher,
      ),
    ).resolves.toMatchObject({
      relationType: "重要相关",
      confidence: "中",
      agentName: "deepseek-classification-agent",
      model: "deepseek-v4-flash",
      companyProfilePatch: {
        intro: "百济神州属于化学制药行业，关联创新药、ADC 等概念。",
      },
      evidence: {
        title: "自动同步资料：百济神州",
        credibility: "中",
      },
      researchProfilePatch: {
        summary: "百济神州聚焦创新药研发和商业化。",
        keyCustomers: ["医院终端与患者群体"],
      },
    });
  });

  it("requires an API key before calling DeepSeek", async () => {
    const fetcher = vi.fn();

    await expect(organizeStockFactsWithDeepSeek({ profile, category }, {}, fetcher)).rejects.toThrow("DeepSeek API key 未配置");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not let the model upgrade a broad rule match into main-business evidence", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  relationType: "主营业务",
                  confidence: "高",
                  rationale: "模型过度判断为主营业务。",
                  sourceFacts: ["行业：化学制药"],
                }),
              },
            },
          ],
        }),
      ),
    );
    const broadProfile: StockLookupProfile = {
      ...profile,
      stockCode: "603650",
      shortName: "彤程新材",
      fullName: "彤程新材料集团股份有限公司",
      industry: "橡胶制品",
      intro: "彤程新材是综合性新材料服务商。",
      mainBusiness: "经营评述：半导体材料包括半导体光刻胶、CMP抛光垫、高纯溶剂EBR等产品。",
      businessReview: "半导体材料包括半导体光刻胶、CMP抛光垫、高纯溶剂EBR等产品。",
      concepts: [],
      industryBlocks: [],
      mainProducts: ["自产电子材料产品"],
      sourceFacts: ["东财F10经营评述：半导体材料包括半导体光刻胶、CMP抛光垫、高纯溶剂EBR等产品"],
    };
    const leafCategory: Pick<CategoryNode, "name" | "aliases" | "description" | "industry"> = {
      name: "显影液/剥离液",
      aliases: [],
      description: "半导体材料中的光刻配套湿化学品方向。",
      industry: "半导体材料",
    };

    await expect(
      organizeStockFactsWithDeepSeek(
        { profile: broadProfile, category: leafCategory },
        { apiKey: "test-key", model: "deepseek-v4-flash" },
        fetcher,
      ),
    ).resolves.toMatchObject({
      relationType: "重要相关",
      confidence: "中",
      rationale: expect.not.stringContaining("过度判断"),
    });
  });
});

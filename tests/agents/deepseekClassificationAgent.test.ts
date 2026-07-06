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
  board: "科创板",
  industry: "化学制药",
  region: "",
  marketCapBand: ">1000亿",
  intro: "东财基础资料显示，百济神州属于化学制药行业，上市板块为科创板。",
  mainBusiness: "化学制药",
  source: "eastmoney",
  sourceDetail: "东方财富 push2 基础资料",
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
    });
  });

  it("requires an API key before calling DeepSeek", async () => {
    const fetcher = vi.fn();

    await expect(organizeStockFactsWithDeepSeek({ profile, category }, {}, fetcher)).rejects.toThrow("DeepSeek API key 未配置");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

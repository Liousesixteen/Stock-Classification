import { describe, expect, it } from "vitest";
import {
  getProviderAcceptanceCompanies,
  runProviderAcceptance,
} from "@/lib/datasources/providerAcceptance";
import type { StockLookupWithTrace } from "@/lib/datasources/stockLookup";

describe("provider acceptance set", () => {
  it("contains 20 to 50 companies across boards and sectors", () => {
    const companies = getProviderAcceptanceCompanies();
    expect(companies.length).toBeGreaterThanOrEqual(20);
    expect(companies.length).toBeLessThanOrEqual(50);
    expect(new Set(companies.map((company) => company.board)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(companies.map((company) => company.sector)).size).toBeGreaterThanOrEqual(15);
  });

  it("summarizes provider coverage and latency deterministically", async () => {
    let time = 0;
    const report = await runProviderAcceptance(
      {
        companies: [{ code: "300346", name: "南大光电", sector: "电子化学品", board: "创业板" }],
      },
      {
        now: () => {
          time += 25;
          return time;
        },
        lookup: async () => mockLookupResult(),
      },
    );

    expect(report).toMatchObject({
      total: 1,
      passed: 1,
      passRate: 1,
      p50LatencyMs: 25,
      p95LatencyMs: 25,
    });
  });
});

function mockLookupResult(): StockLookupWithTrace {
  const providerIds = [
    "eastmoney_push2",
    "tencent_quote",
    "eastmoney_f10_company_survey",
    "eastmoney_f10_business_analysis",
  ] as const;
  return {
    profile: {
      stockCode: "300346",
      shortName: "南大光电",
      fullName: "江苏南大光电材料股份有限公司",
      board: "创业板",
      industry: "电子化学品",
      region: "江苏",
      marketCapBand: "100-300亿",
      intro: "电子材料公司",
      mainBusiness: "电子材料",
      businessScope: "电子材料",
      businessReview: "",
      concepts: [],
      industryBlocks: [],
      mainProducts: [],
      sourceFacts: [],
      source: "eastmoney",
      sourceDetail: "测试",
    },
    traces: providerIds.map((provider) => ({
      provider,
      providerLabel: provider,
      required: provider === "eastmoney_push2",
      status: "success",
      facts: {},
      expectedFields: [],
      sourceUrl: "",
      confidence: "high",
      cacheTtlMs: 60_000,
      fetchedAt: "2026-07-26T00:00:00.000Z",
      error: "",
      durationMs: 10,
      circuitState: "closed",
    })),
  };
}

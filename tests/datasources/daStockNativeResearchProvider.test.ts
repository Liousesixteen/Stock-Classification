import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import {
  fetchEastmoneyCapitalFlow,
  fetchEastmoneyMarketBreadth,
  fetchEastmoneyMarketNews,
  fetchEastmoneySectorRankings,
  fetchTencentMarketIndices,
  refreshNativeResearchFacts,
} from "@/lib/datasources/daStockNativeResearchProvider";
import { isTrustedOpenMarketSource } from "@/lib/datasources/daStockDataSourceProvider";
import { migrate } from "@/lib/db/schema";
import { listCompanyFieldFacts } from "@/lib/repositories/companyFieldFacts";
import { upsertCompany } from "@/lib/repositories/companies";

describe("DA-Stock native research providers", () => {
  it("keeps authoritative market publishers and rejects forum or content-farm sources", () => {
    expect(isTrustedOpenMarketSource({ url: "https://finance.eastmoney.com/a/20260815.html" })).toBe(true);
    expect(isTrustedOpenMarketSource({ url: "https://www.csrc.gov.cn/csrc/c100028/content.shtml" })).toBe(true);
    expect(isTrustedOpenMarketSource({ url: "https://bbs.hupu.com/641821858.html" })).toBe(false);
    expect(isTrustedOpenMarketSource({ url: "https://www.tgb.cn/a/example" })).toBe(false);
    expect(isTrustedOpenMarketSource({ url: "https://www.xyhndec.cn/wangshang/example.html" })).toBe(false);
  });

  it("normalizes Tencent indices and Eastmoney sector/capital-flow payloads", async () => {
    const indexLine = [
      "", "Shanghai Composite", "000001", "3200", "3190", "3180",
      ...Array.from({ length: 25 }, () => "0"),
      "10", "0.31", "3220", "3170", "0", "0", "123456",
    ].join("~");
    const indices = await fetchTencentMarketIndices(async () =>
      new Response(new TextEncoder().encode(`v_sh000001=\"${indexLine}\";`), { status: 200 }));
    expect(indices.indices[0]).toMatchObject({
      code: "000001",
      name: "Shanghai Composite",
      price: 3200,
      changePercent: 0.31,
      amountYi: 12.35,
    });

    const sectors = await fetchEastmoneySectorRankings(async (input) => {
      const descending = new URL(String(input)).searchParams.get("po") !== "0";
      const diff = [
        { f12: "BK1", f14: "半导体", f3: 3.5, f104: 70, f105: 12, f140: "测试股份", f136: 10.1 },
        { f12: "BK2", f14: "银行", f3: -1.2, f104: 5, f105: 38, f140: "样本银行", f136: 0.2 },
      ];
      return new Response(JSON.stringify({ data: { total: 2, diff: descending ? diff : [...diff].reverse() } }), { status: 200 });
    }, 1);
    expect(sectors.top[0]).toMatchObject({ name: "半导体", changePercent: 3.5 });
    expect(sectors.bottom[0]).toMatchObject({ name: "银行", changePercent: -1.2 });

    const flow = await fetchEastmoneyCapitalFlow("600519", async () => new Response(JSON.stringify({
      data: {
        klines: [
          "2026-07-30,100,10,20,30,40",
          "2026-07-31,-50,5,10,-20,-30",
        ],
      },
    }), { status: 200 }));
    expect(flow.flow).toMatchObject({
      stockCode: "600519",
      latestDate: "2026-07-31",
      latestMainNet: -50,
      mainNet5d: 50,
    });
    expect(flow.sourceUrl).toContain("secid=1.600519");
  });

  it("summarizes full-market breadth without asking the model to infer it", async () => {
    const result = await fetchEastmoneyMarketBreadth(async () => new Response(JSON.stringify({
      data: { diff: [
        { f3: 2, f6: 10_000_000 },
        { f3: -1, f6: 20_000_000 },
        { f3: 0, f6: 30_000_000 },
        { f3: 10.1, f6: 40_000_000 },
        { f3: -10.2, f6: 50_000_000 },
      ] },
    }), { status: 200 }));
    expect(result.breadth).toMatchObject({
      sampleCount: 5,
      upCount: 2,
      downCount: 2,
      flatCount: 1,
      strongUpCount: 1,
      strongDownCount: 1,
      totalAmountYi: 1.5,
      medianChangePercent: 0,
    });
  });

  it("normalizes direct market news as event leads", async () => {
    const result = await fetchEastmoneyMarketNews(async () => new Response(JSON.stringify({
      data: { fastNewsList: [{
        code: "20260830001",
        title: "上市公司发布半年度报告",
        summary: "公司披露营业收入与净利润变化。",
        showTime: "2026-08-30 18:00:00",
        stockList: ["1.600000"],
      }] },
    }), { status: 200 }));
    expect(result.news[0]).toMatchObject({
      code: "20260830001",
      publishedAt: "2026-08-30 18:00:00",
      relatedStocks: ["1.600000"],
    });
  });

  it("persists native market context as traceable field facts", async () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    upsertCompany(db, {
      stockCode: "600519",
      shortName: "贵州茅台",
      fullName: "",
      board: "沪市主板",
      industry: "白酒",
      region: "",
      marketCapBand: "",
      intro: "",
      mainBusiness: "",
      updatedAt: "",
    });
    const indexLine = [
      "", "Shanghai Composite", "000001", "3200", "3190", "3180",
      ...Array.from({ length: 25 }, () => "0"),
      "10", "0.31", "3220", "3170", "0", "0", "123456",
    ].join("~");
    const quoteFields = Array.from({ length: 47 }, () => "0");
    quoteFields[1] = "贵州茅台";
    quoteFields[2] = "600519";
    quoteFields[3] = "1500";
    quoteFields[4] = "1490";
    quoteFields[5] = "1495";
    quoteFields[30] = "20260830150000";
    quoteFields[31] = "10";
    quoteFields[32] = "0.67";
    quoteFields[33] = "1510";
    quoteFields[34] = "1480";
    quoteFields[37] = "123456";
    quoteFields[38] = "0.5";
    quoteFields[39] = "25";
    quoteFields[44] = "18000";
    quoteFields[45] = "21000";
    quoteFields[46] = "8";
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("qt.gtimg.cn")) {
        const payload = url.includes("sh600519")
          ? `v_sh600519=\"${quoteFields.join("~")}\";`
          : `v_sh000001=\"${indexLine}\";`;
        return new Response(new TextEncoder().encode(payload), { status: 200 });
      }
      if (url.includes("clist/get")) {
        return new Response(JSON.stringify({ data: { diff: [{ f12: "BK1", f14: "白酒", f3: 1.2 }] } }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: { klines: ["2026-07-31,100,10,20,30,40"] } }), { status: 200 });
    };

    const result = await refreshNativeResearchFacts(db, "600519", fetcher);
    expect(result.successfulProviders).toHaveLength(4);
    expect(listCompanyFieldFacts(db, "600519")).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldKey: "realtimeQuote", status: "available", provider: "native_research_tencent_quote" }),
      expect.objectContaining({ fieldKey: "marketIndices", status: "available", provider: "native_research_tencent_indices" }),
      expect.objectContaining({ fieldKey: "sectorRankings", status: "available", provider: "native_research_eastmoney_sectors" }),
      expect.objectContaining({ fieldKey: "capitalFlow", status: "available", provider: "native_research_eastmoney_capital_flow" }),
    ]));
  });
});

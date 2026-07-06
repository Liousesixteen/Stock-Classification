import { describe, expect, it } from "vitest";
import { eastmoneySecId, inferBoard, lookupStockProfile, resolveStockQuery } from "@/lib/datasources/stockLookup";

describe("stockLookup", () => {
  it("infers common A-share boards from the stock code prefix", () => {
    expect(inferBoard("300346")).toBe("创业板");
    expect(inferBoard("688019")).toBe("科创板");
    expect(inferBoard("600519")).toBe("沪市主板");
    expect(inferBoard("002371")).toBe("深市主板");
    expect(inferBoard("835185")).toBe("北交所");
  });

  it("builds Eastmoney secids for Shanghai and Shenzhen style codes", () => {
    expect(eastmoneySecId("600519")).toBe("1.600519");
    expect(eastmoneySecId("688019")).toBe("1.688019");
    expect(eastmoneySecId("300346")).toBe("0.300346");
  });

  it("maps Eastmoney stock basics into a company profile", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("secid")).toBe("0.300346");
      expect(url.searchParams.get("fields")).toContain("f57");
      return new Response(
        JSON.stringify({
          data: {
            f57: "300346",
            f58: "南大光电",
            f116: 18_600_000_000,
            f117: 16_200_000_000,
            f127: "电子化学品",
            f189: "20120807",
          },
        }),
      );
    };

    await expect(lookupStockProfile("300346", fetcher)).resolves.toMatchObject({
      stockCode: "300346",
      shortName: "南大光电",
      board: "创业板",
      industry: "电子化学品",
      marketCapBand: "100-300亿",
      intro: "东财基础资料显示，南大光电属于电子化学品行业，上市板块为创业板。",
      mainBusiness: "电子化学品",
      source: "eastmoney",
    });
  });

  it("resolves an exact Chinese stock name from a local stock index before lookup", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("secid")).toBe("1.688235");
      return new Response(
        JSON.stringify({
          data: {
            f57: "688235",
            f58: "百济神州",
            f116: 427_000_000_000,
            f127: "化学制药",
          },
        }),
      );
    };

    await expect(
      lookupStockProfile("百济神州", fetcher, {
        stockIndexItems: [["688235.SH", "688235", "百济神州", "baijishenzhou", "bjsz", [], "CN", "stock", true, 100]],
      }),
    ).resolves.toMatchObject({
      stockCode: "688235",
      shortName: "百济神州",
      board: "科创板",
      industry: "化学制药",
    });
  });

  it("searches local stock index by code name and pinyin abbreviation", () => {
    const stockIndexItems = [
      ["688235.SH", "688235", "百济神州", "baijishenzhou", "bjsz", [], "CN", "stock", true, 100],
      ["06160.HK", "06160", "百济神州", "baijishenzhou", "bjsz", [], "HK", "stock", true, 100],
      ["300059.SZ", "300059", "东方财富", "dongfangcaifu", "dfcf", [], "CN", "stock", true, 100],
    ];

    expect(resolveStockQuery("百济神州", { stockIndexItems })?.displayCode).toBe("688235");
    expect(resolveStockQuery("dfcf", { stockIndexItems })?.displayCode).toBe("300059");
    expect(resolveStockQuery("06160", { stockIndexItems })).toBeUndefined();
  });

  it("throws a clear error when the upstream response does not contain stock data", async () => {
    const fetcher = async () => new Response(JSON.stringify({ data: null }));

    await expect(lookupStockProfile("300346", fetcher)).rejects.toThrow("未查询到股票基础资料");
  });
});

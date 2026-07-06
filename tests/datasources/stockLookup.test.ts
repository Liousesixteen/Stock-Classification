import { describe, expect, it } from "vitest";
import { eastmoneySecId, inferBoard, lookupStockProfile } from "@/lib/datasources/stockLookup";

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

  it("throws a clear error when the upstream response does not contain stock data", async () => {
    const fetcher = async () => new Response(JSON.stringify({ data: null }));

    await expect(lookupStockProfile("300346", fetcher)).rejects.toThrow("未查询到股票基础资料");
  });
});

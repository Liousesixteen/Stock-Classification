import { describe, expect, it } from "vitest";
import { fetchEastmoneyMarketTechnicalSnapshots, fetchEastmoneyTechnicalSnapshot } from "@/lib/datasources/eastmoneyTechnicalProvider";

describe("Eastmoney technical provider", () => {
  it("normalizes daily bars and calculates bounded technical facts", async () => {
    const bars = Array.from({ length: 80 }, (_, index) => {
      const close = 10 + index * 0.1;
      return [
        `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
        (close - 0.05).toFixed(2),
        close.toFixed(2),
        (close + 0.2).toFixed(2),
        (close - 0.2).toFixed(2),
        String(1_000 + index * 10),
        "0",
        "0",
        "0",
        "0",
        "1.2",
      ].join(",");
    });
    const snapshot = await fetchEastmoneyTechnicalSnapshot("600030", async () =>
      new Response(JSON.stringify({ data: { klines: bars } }), { status: 200 }), 80);

    expect(snapshot).toMatchObject({
      stockCode: "600030",
      source: "eastmoney_kline",
      recordCount: 80,
      latest: { close: 17.9, turnoverPercent: 1.2 },
    });
    expect(snapshot.ma.ma5).toBeTypeOf("number");
    expect(snapshot.macd.dif).toBeTypeOf("number");
    expect(snapshot.rsi6).toBeGreaterThanOrEqual(0);
    expect(snapshot.rsi6).toBeLessThanOrEqual(100);
    expect(snapshot.sourceUrl).toContain("secid=1.600030");
    expect(snapshot.recentBars).toHaveLength(60);
  });

  it("uses the correct exchange identifiers for market index history", async () => {
    const requested: string[] = [];
    const bars = Array.from({ length: 30 }, (_, index) => `2026-08-${String((index % 28) + 1).padStart(2, "0")},10,${10 + index / 10},11,9,1000,0,0,0,0,1`);
    const result = await fetchEastmoneyMarketTechnicalSnapshots(async (input) => {
      requested.push(String(input));
      return new Response(JSON.stringify({ data: { klines: bars } }), { status: 200 });
    }, 30);
    expect(result.snapshots).toHaveLength(4);
    expect(result.snapshots[0]).toMatchObject({ stockCode: "000001", securityName: "上证指数" });
    expect(requested).toEqual(expect.arrayContaining([
      expect.stringContaining("secid=1.000001"),
      expect.stringContaining("secid=0.399006"),
      expect.stringContaining("secid=1.000300"),
    ]));
  });

  it("falls back to Tencent K-line history when Eastmoney is unavailable", async () => {
    const bars = Array.from({ length: 40 }, (_, index) => [
      `2026-07-${String((index % 28) + 1).padStart(2, "0")}`,
      "10",
      String(10 + index / 10),
      "15",
      "9",
      String(1000 + index),
    ]);
    const requested: string[] = [];
    const snapshot = await fetchEastmoneyTechnicalSnapshot("000001", async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.includes("push2his.eastmoney.com")) return new Response("upstream unavailable", { status: 503 });
      return new Response(JSON.stringify({ code: 0, data: { sz000001: { qfqday: bars } } }), { status: 200 });
    }, 40);

    expect(snapshot).toMatchObject({ stockCode: "000001", source: "tencent_kline", recordCount: 40 });
    expect(snapshot.latest.turnoverPercent).toBeNull();
    expect(requested).toEqual(expect.arrayContaining([
      expect.stringContaining("push2his.eastmoney.com"),
      expect.stringContaining("web.ifzq.gtimg.cn"),
    ]));
  });
});
